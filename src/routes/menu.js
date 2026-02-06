import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { pool } from "../db.js";
import {normalizeText} from "../utils/normalizeText.js";

const router = express.Router();

/* ===== UPLOAD CONFIG ===== */
const upload = multer({
  dest: "src/uploads/excel/",
  limits: { fileSize: 5 * 1024 * 1024 }
});

/* ===== IMPORT MENU ===== */
router.post("/upload-excel", upload.single("file"), async (req, res) => {
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
          (name, price, area, category_id, image, sort_order, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, true)
          `,
          [
            item.name,
            item.price,
            item.area,
            item.category_id,
            image,          // ❗ KHÔNG BAO GIỜ NULL
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
    WHERE m.is_active = true
    ORDER BY c.sort_order, m.sort_order
  `);

  const data = rows.map(item => ({
    ...item,
    has_toppings: item.has_toppings, // 👈 QUAN TRỌNG
    image_url: item.image
      ? `/uploads/menu/${item.image}.jpg`
      : `/uploads/menu/default.jpg`
  }));

  res.json(data);
});

// ===== GET TOPPINGS FOR MENU ITEM =====
router.get("/:menuId/toppings", async (req, res) => {
  try {
    const { menuId } = req.params;

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
      WHERE mt.menu_id = $1
        AND t.is_active = true
      ORDER BY t.name
      `,
      [menuId]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET TOPPINGS ERROR:", err);
    res.status(500).json({ message: "❌ Lỗi lấy toppings" });
  }
});



export default router;
