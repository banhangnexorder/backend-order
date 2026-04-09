import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";
import { pool } from "../db.js";
import { normalizeText } from "../utils/normalizeText.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

const upload = multer({
  dest: "src/uploads/tmp",
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post(
  "/import/full",
  verifyToken, // 🔥 BẮT BUỘC
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "❌ Chưa upload file Excel" });
    }

    const overwrite = req.body.overwrite === "true";

    const tenantId = req.user.tenant_id;
    const storeId = req.user.store_id;

    console.log("🔥 IMPORT STORE:", storeId);

    const client = await pool.connect();

    try {
      const workbook = XLSX.readFile(req.file.path);

      const menus = XLSX.utils.sheet_to_json(workbook.Sheets["menu"], { defval: "" });
      const toppings = XLSX.utils.sheet_to_json(workbook.Sheets["toppings"], { defval: "" });
      const menuToppings = XLSX.utils.sheet_to_json(workbook.Sheets["menu_toppings"], { defval: "" });

      await client.query("BEGIN");

      /* ======================================================
         🔥 0. CATEGORY CACHE (THEO STORE)
      ====================================================== */
      const catRes = await client.query(
        "SELECT id, name FROM categories WHERE store_id=$1",
        [storeId]
      );

      const categoryMap = new Map();
      catRes.rows.forEach(c => {
        categoryMap.set(c.id, c.id);
      });

      /* ======================================================
         🔥 1. UPSERT TOPPINGS
      ====================================================== */
      for (const row of toppings) {
        const name = row.name?.trim();
        if (!name) continue;

        const normalized = normalizeText(name);

        await client.query(
          `
          INSERT INTO toppings (name, normalized_name, price, is_active, tenant_id, store_id)
          VALUES ($1,$2,$3,true,$4,$5)
          ON CONFLICT (normalized_name)
          DO UPDATE SET price = EXCLUDED.price
          `,
          [
            name,
            normalized,
            Number(row.price) || 0,
            tenantId,
            storeId
          ]
        );
      }

      /* ======================================================
         🔥 2. OVERWRITE (OPTIONAL)
      ====================================================== */
      if (overwrite) {
        await client.query("DELETE FROM menu_toppings WHERE store_id=$1", [storeId]);
        await client.query("DELETE FROM menu_items WHERE store_id=$1", [storeId]);
      }

      /* ======================================================
         🔥 3. CATEGORY AUTO CREATE
      ====================================================== */
      for (const row of menus) {
        const categoryId = row.category_id?.trim();
        if (!categoryId) continue;

        if (!categoryMap.has(categoryId)) {
          const inserted = await client.query(
            `
            INSERT INTO categories (id, name, tenant_id, store_id)
            VALUES ($1,$2,$3,$4)
            ON CONFLICT (id) DO NOTHING
            RETURNING id
            `,
            [categoryId, categoryId, tenantId, storeId]
          );

          categoryMap.set(categoryId, categoryId);
        }
      }

      /* ======================================================
         🔥 4. INSERT MENU
      ====================================================== */
      for (const row of menus) {
        const name = row.name?.trim();
        if (!name) continue;

        const categoryId = row.category_id?.trim();

        const image = normalizeText(name);

        await client.query(
          `
          INSERT INTO menu_items
          (name, price, area, category_id, image, sort_order, is_active, tenant_id, store_id)
          VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8)
          `,
          [
            name,
            Number(row.price) || 0,
            row.area || "bar",
            categoryId,
            image,
            Number(row.sort_order) || 0,
            tenantId,
            storeId
          ]
        );
      }

      /* ======================================================
         🔥 5. MAP MENU & TOPPING
      ====================================================== */
      const menuMap = new Map();
      const toppingMap = new Map();

      const menuRes = await client.query(
        "SELECT id, image FROM menu_items WHERE store_id=$1",
        [storeId]
      );

      menuRes.rows.forEach(m => menuMap.set(m.image, m.id));

      const toppingRes = await client.query(
        "SELECT id, normalized_name FROM toppings WHERE store_id=$1",
        [storeId]
      );

      toppingRes.rows.forEach(t => toppingMap.set(t.normalized_name, t.id));

      /* ======================================================
         🔥 6. INSERT MENU_TOPPINGS
      ====================================================== */
      for (const row of menuToppings) {
        const menuId = menuMap.get(normalizeText(row.menu_name));
        const toppingId = toppingMap.get(normalizeText(row.topping_name));

        if (!menuId || !toppingId) continue;

        await client.query(
          `
          INSERT INTO menu_toppings
          (menu_id, topping_id, required, max_quantity, tenant_id, store_id)
          VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [
            menuId,
            toppingId,
            Number(row.required) === 1,
            Number(row.max_quantity) || 1,
            tenantId,
            storeId
          ]
        );
      }

      await client.query("COMMIT");

      res.json({
        message: "✅ Import FULL thành công 🚀",
        storeId,
        menu: menus.length,
        toppings: toppings.length,
        links: menuToppings.length
      });

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ IMPORT ERROR:", err);
      res.status(500).json({ message: err.message });
    } finally {
      client.release();
      fs.unlinkSync(req.file.path);
    }
  }
);

export default router;