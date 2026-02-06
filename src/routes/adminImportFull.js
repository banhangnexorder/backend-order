import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";
import { pool } from "../db.js";
import { normalizeText } from "../utils/normalizeText.js";

const router = express.Router();

const upload = multer({
  dest: "src/uploads/tmp",
  limits: { fileSize: 5 * 1024 * 1024 }
});

/*
  Excel gồm 3 sheet:
  - menu
  - toppings
  - menu_toppings
*/
router.post(
  "/import/full",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "❌ Chưa upload file Excel" });
    }

    const overwrite = req.body.overwrite === "true";
    const client = await pool.connect();

    try {
      const workbook = XLSX.readFile(req.file.path);

      const menuSheet = workbook.Sheets["menu"];
      const toppingSheet = workbook.Sheets["toppings"];
      const menuToppingSheet = workbook.Sheets["menu_toppings"];

      if (!menuSheet || !toppingSheet || !menuToppingSheet) {
        throw new Error("❌ File phải có đủ sheet: menu, toppings, menu_toppings");
      }

      const menus = XLSX.utils.sheet_to_json(menuSheet, { defval: "" });
      const toppings = XLSX.utils.sheet_to_json(toppingSheet, { defval: "" });
      const menuToppings = XLSX.utils.sheet_to_json(menuToppingSheet, { defval: "" });

      await client.query("BEGIN");

      /* ======================================================
         1. IMPORT TOPPINGS (UPSERT)
      ====================================================== */
      for (const row of toppings) {
        const name = row.name?.trim();
        if (!name) continue;

        const normalized = normalizeText(name);
        const price = Number(row.price) || 0;
        const isActive = Number(row.is_active) === 1;

        await client.query(
          `
          INSERT INTO toppings (name, normalized_name, price, is_active)
          VALUES ($1,$2,$3,$4)
          ON CONFLICT (normalized_name)
          DO UPDATE SET
            price = EXCLUDED.price,
            is_active = EXCLUDED.is_active
          `,
          [name, normalized, price, isActive]
        );
      }

      /* ======================================================
         2. OVERWRITE MENU (NẾU CHỌN)
      ====================================================== */
      if (overwrite) {
        await client.query("DELETE FROM menu_toppings");
        await client.query("DELETE FROM menu_items");
      }

      /* ======================================================
         3. IMPORT MENU
         ⚠️ KHÔNG DÙNG normalized_name
         image = normalizeText(name)
      ====================================================== */
      for (const row of menus) {
        const name = row.name?.trim();
        if (!name) continue;

        const image = normalizeText(name);
        const price = Number(row.price) || 0;
        const area = row.area;
        const sortOrder = Number(row.sort_order) || 0;
        const categoryId = row.category_id?.trim();

        if (!categoryId) {
          throw new Error(`❌ Thiếu category_id cho món: ${name}`);
        }

        // CHECK CATEGORY THEO ID (cf, cake, tea...)
        const cat = await client.query(
          "SELECT id FROM categories WHERE id = $1",
          [categoryId]
        );

        if (!cat.rowCount) {
          throw new Error(`❌ Category không tồn tại: ${categoryId}`);
        }

        await client.query(
          `
          INSERT INTO menu_items
          (name, price, area, category_id, image, sort_order, is_active)
          VALUES ($1,$2,$3,$4,$5,$6,true)
          `,
          [
            name,
            price,
            area,
            categoryId,
            image,
            sortOrder
          ]
        );
      }

      /* ======================================================
         4. IMPORT MENU_TOPPINGS
         MATCH QUA image
      ====================================================== */
      for (const row of menuToppings) {
        const menuImage = normalizeText(row.menu_name || "");
        const toppingNorm = normalizeText(row.topping_name || "");

        if (!menuImage || !toppingNorm) continue;

        const menu = await client.query(
          "SELECT id FROM menu_items WHERE image = $1",
          [menuImage]
        );

        const topping = await client.query(
          "SELECT id FROM toppings WHERE normalized_name = $1",
          [toppingNorm]
        );

        if (!menu.rowCount || !topping.rowCount) continue;

        await client.query(
          `
          INSERT INTO menu_toppings
          (menu_id, topping_id, required, max_quantity)
          VALUES ($1,$2,$3,$4)
          `,
          [
            menu.rows[0].id,
            topping.rows[0].id,
            Number(row.required) === 1,
            Number(row.max_quantity) || 1
          ]
        );
      }

      await client.query("COMMIT");

      res.json({
        message: "✅ Import FULL menu thành công",
        menu: menus.length,
        toppings: toppings.length,
        menu_toppings: menuToppings.length,
        overwrite
      });

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("IMPORT FULL ERROR:", err);
      res.status(500).json({ message: err.message });
    } finally {
      client.release();
      fs.unlinkSync(req.file.path);
    }
  }
);

export default router;
