import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { pool } from "../db.js";
import {normalizeText} from "../utils/normalizeText.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();
let menuCache = null;

/* ===== UPLOAD CONFIG ===== */
const upload = multer({
  dest: "src/uploads/excel/",
  limits: { fileSize: 5 * 1024 * 1024 }
});

/* ===== IMPORT MENU ===== */
router.post("/upload-excel", verifyToken, upload.single("file"), async (req, res) => {
  const store_id = req.user.store_id;
  try {
    if (!req.file) {
      return res.status(400).json({ message: "❌ Không có file" });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows.length) {
      return res.status(400).json({ message: "❌ File rỗng" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const item of rows) {
        if (!item.name) continue;

        // 🔥 AUTO IMAGE FROM NAME
        const image = normalizeText(item.name);

        await client.query(
          `
          INSERT INTO menu_items
          (store_id, name, price, area, category_id, image, sort_order, is_active)
          VALUES ($1,$2,$3,$4,$5,$6,$7,true)
          `,
          [
            store_id,
            item.name,
            item.price,
            item.area,
            item.category_id,
            image,
            item.sort_order || 0
          ]
        );
      }

      await client.query("COMMIT");

      res.json({
        message: "✅ Import menu thành công",
        total: rows.length
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("IMPORT ERROR:", err);
    res.status(500).json({ message: "❌ Lỗi import menu" });
  }
});

/* ===== GET MENU (CLIENT / POS) ===== */
router.get("/", async (req, res) => {
  try {

    const store_id = req.query.store_id;

    if (!store_id) {
      return res.status(400).json({ message: "Missing store_id" });
    }
    if (menuCache) {
      return res.json(menuCache);
    }

    const { rows } = await pool.query(`
      SELECT
      m.id,
      m.name,
      m.price,
      m.area,
      m.category_id,
      c.name AS category_name,
      m.image,
      m.sort_order,
      EXISTS (
        SELECT 1 FROM menu_toppings mt WHERE mt.menu_id = m.id
      ) AS has_toppings
      FROM menu_items m
      JOIN categories c ON c.id = m.category_id
      WHERE
      m.is_active = true
      AND m.store_id = $1
      ORDER BY c.sort_order, m.sort_order
    `, [store_id]);

    const data = rows.map(item => ({
      ...item,
      image_url: item.image
        ? `${item.image}`
        : `/uploads/menu/default`
    }));
    menuCache = data;

    res.json(data);

  } catch (err) {

    console.error("GET MENU ERROR:", err);

    res.status(500).json({
      message: "Server error",
      error: err.message
    });

  }
});

// ===== GET TOPPINGS FOR MENU ITEM =====
router.get("/:menuId/toppings", async (req, res) => {
  try {
    const { menuId } = req.params;
    const { store_id } = req.query;

    const { rows } = await pool.query(
      `
      SELECT
      t.id,
      t.name,
      t.price,
      mt.required,
      mt.max_quantity
      FROM menu_toppings mt
      JOIN toppings t ON t.id = mt.topping_id
      JOIN menu_items m ON m.id = mt.menu_id
      WHERE mt.menu_id = $1
      AND m.store_id = $2
      AND t.is_active = true
      `,
      [menuId, store_id]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET TOPPINGS ERROR:", err);
    res.status(500).json({ message: "❌ Lỗi lấy toppings" });
  }
});



export default router;
