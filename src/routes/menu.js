import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { pool } from "../db.js";
import {normalizeText} from "../utils/normalizeText.js";
import { verifyToken } from "../middleware/auth.js";
import { verifyQrToken } from "../middleware/verifyQrToken.js";
import { getCache, setCache } from "../utils/cache.js";

const router = express.Router();
let menuCache = null;

/* ===== UPLOAD CONFIG ===== */
const upload = multer({
  dest: "src/uploads/excel/",
  limits: { fileSize: 5 * 1024 * 1024 }
});

/* ===== AUTO CATEGORY LOGIC ===== */
function extractCategory(name) {
  if (!name) return "Khác";

  const lower = name.toLowerCase();

  if (lower.includes("cà phê")) return "Cà phê";
  if (lower.includes("trà")) return "Trà";
  if (lower.includes("sinh tố")) return "Sinh tố";
  if (lower.includes("nước")) return "Nước uống";
  if (lower.includes("bánh")) return "Bánh";

  // fallback → lấy 1-2 từ đầu
  const words = name.trim().split(" ");
  if (words.length >= 2) return `${words[0]} ${words[1]}`;

  return words[0];
}

/* ===== IMPORT MENU ===== */
router.post(
  "/upload-excel",
  verifyToken,
  upload.single("file"),
  async (req, res) => {
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

        /* ===== XÓA DATA CŨ ===== */
        await client.query(
          `DELETE FROM menu_items WHERE store_id=$1`,
          [store_id]
        );

        // ⚠️ KHÔNG xoá categories → để reuse

        /* ===== CACHE CATEGORY ===== */
        const categoryCache = {};

        for (const item of rows) {
          if (!item.name) continue;

          /* ===== CATEGORY ===== */
          const categoryName = extractCategory(item.name);

          let categoryId = categoryCache[categoryName];

          if (!categoryId) {
            const existing = await client.query(
              `SELECT id FROM categories WHERE LOWER(name)=LOWER($1) AND store_id=$2`,
              [categoryName, store_id]
            );

            if (existing.rows.length > 0) {
              categoryId = existing.rows[0].id;
            } else {
              const inserted = await client.query(
                `
                INSERT INTO categories (name, store_id, sort_order)
                VALUES ($1,$2,0)
                RETURNING id
                `,
                [categoryName, store_id]
              );
              categoryId = inserted.rows[0].id;
            }

            categoryCache[categoryName] = categoryId;
          }

          /* ===== INSERT MENU ===== */
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
              item.price || 0,
              item.area || "bar",
              categoryId,
              image,
              item.sort_order || 0
            ]
          );
        }

        await client.query("COMMIT");

        setCache(`menu:${store_id}`, null);

        res.json({
          message: "✅ Import menu + auto category thành công",
          total: rows.length
        });

      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

    } catch (err) {
      console.error("IMPORT ERROR:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/* ===== GET MENU (CLIENT / POS) ===== */
router.get("/", verifyQrToken, async (req, res) => {
  try {
    const { store_id } = req.qr;

    if (!store_id) {
      return res.status(400).json({ message: "Missing store_id" });
    }

    const cacheKey = `menu:${store_id}`;

    const cached = getCache(cacheKey);

    if (cached) {
      console.log("⚡ CACHE HIT:", cacheKey);
      return res.json(cached);
    }

    console.log("🔥 DB HIT:", cacheKey);

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
          SELECT 1 
          FROM menu_toppings mt
          WHERE mt.menu_id = m.id
        ) AS has_toppings
      FROM menu_items m
      JOIN categories c ON c.id = m.category_id AND c.store_id = m.store_id
      WHERE
        m.is_active = true
        AND m.store_id = $1
      ORDER BY c.sort_order, m.sort_order
    `, [store_id]);

    const data = rows.map(item => ({
      ...item,
      image_url: item.image || "/uploads/menu/default"
    }));

    console.log("🔥 DB RESPONSE:", data);

    setCache(cacheKey, data);

    res.json(data);

  } catch (err) {
    console.error("GET MENU ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// ===== GET TOPPINGS FOR MENU ITEM =====
router.get("/:menuId/toppings", verifyQrToken, async (req, res) => {
  try {
    const { menuId } = req.params;
    const { store_id } = req.qr;

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
