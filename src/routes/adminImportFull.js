import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";
import { pool } from "../db.js";
import { normalizeText } from "../utils/normalizeText.js";
import jwt from "jsonwebtoken";

const router = express.Router();

const upload = multer({
  dest: "src/uploads/tmp",
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post(
  "/import/full",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "❌ Chưa upload file Excel" });
    }
    console.log("UPLOAD MENU NMTHANH");
    const overwrite = req.body.overwrite === "true";

    // 🔥 LẤY TỪ LOGIN ADMIN (QUAN TRỌNG)
    const tenantId = req.user?.tenant_id;
    const storeId = req.user?.store_id;

    if (!tenantId || !storeId) {
      return res.status(401).json({ message: "❌ Missing tenant/store" });
    }

    const client = await pool.connect();

    try {
      const workbook = XLSX.readFile(req.file.path);

      const menus = XLSX.utils.sheet_to_json(workbook.Sheets["menu"], { defval: "" });
      const toppings = XLSX.utils.sheet_to_json(workbook.Sheets["toppings"], { defval: "" });
      const menuToppings = XLSX.utils.sheet_to_json(workbook.Sheets["menu_toppings"], { defval: "" });

      await client.query("BEGIN");

      /* ======================================================
         🔥 0. CACHE CATEGORY
      ====================================================== */
      const catRes = await client.query("SELECT id FROM categories");
      const categorySet = new Set(catRes.rows.map(c => c.id));

      /* ======================================================
         🔥 1. UPSERT TOPPINGS (BATCH)
      ====================================================== */
      const toppingValues = [];
      const toppingParams = [];

      toppings.forEach((row, i) => {
        const name = row.name?.trim();
        if (!name) return;

        const normalized = normalizeText(name);

        toppingValues.push(
          `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        );

        toppingParams.push(
          name,
          normalized,
          Number(row.price) || 0,
          Number(row.is_active) === 1,
          tenantId,
          storeId
        );
      });

      if (toppingValues.length > 0) {
        await client.query(`
          INSERT INTO toppings
          (name, normalized_name, price, is_active, tenant_id, store_id)
          VALUES ${toppingValues.join(",")}
          ON CONFLICT (normalized_name)
          DO UPDATE SET
            price = EXCLUDED.price,
            is_active = EXCLUDED.is_active
        `, toppingParams);
      }

      /* ======================================================
         🔥 2. OVERWRITE
      ====================================================== */
      if (overwrite) {
        await client.query("DELETE FROM menu_toppings WHERE tenant_id=$1", [tenantId]);
        await client.query("DELETE FROM menu_items WHERE tenant_id=$1", [tenantId]);
      }

      /* ======================================================
         🔥 3. INSERT MENU (BATCH)
      ====================================================== */
      const menuValues = [];
      const menuParams = [];

      menus.forEach((row, i) => {
        const name = row.name?.trim();
        if (!name) return;

        const categoryId = row.category_id?.trim();
        if (!categorySet.has(categoryId)) {
          throw new Error(`❌ Category không tồn tại: ${categoryId}`);
        }

        const image = normalizeText(name);

        menuValues.push(
          `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`
        );

        menuParams.push(
          name,
          Number(row.price) || 0,
          row.area,
          categoryId,
          image,
          Number(row.sort_order) || 0,
          true,
          tenantId,
          storeId
        );
      });

      if (menuValues.length > 0) {
        await client.query(`
          INSERT INTO menu_items
          (name, price, area, category_id, image, sort_order, is_active, tenant_id, store_id)
          VALUES ${menuValues.join(",")}
        `, menuParams);
      }

      /* ======================================================
         🔥 4. CACHE MENU + TOPPING
      ====================================================== */
      const menuMap = new Map();
      const toppingMap = new Map();

      const menuRes = await client.query(
        "SELECT id, image FROM menu_items WHERE tenant_id=$1",
        [tenantId]
      );

      menuRes.rows.forEach(m => menuMap.set(m.image, m.id));

      const toppingRes = await client.query(
        "SELECT id, normalized_name FROM toppings WHERE tenant_id=$1",
        [tenantId]
      );

      toppingRes.rows.forEach(t => toppingMap.set(t.normalized_name, t.id));

      /* ======================================================
         🔥 5. INSERT MENU_TOPPINGS (BATCH)
      ====================================================== */
      const mtValues = [];
      const mtParams = [];

      menuToppings.forEach((row, i) => {
        const menuId = menuMap.get(normalizeText(row.menu_name));
        const toppingId = toppingMap.get(normalizeText(row.topping_name));

        if (!menuId || !toppingId) return;

        mtValues.push(
          `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        );

        mtParams.push(
          menuId,
          toppingId,
          Number(row.required) === 1,
          Number(row.max_quantity) || 1,
          tenantId,
          storeId
        );
      });

      if (mtValues.length > 0) {
        await client.query(`
          INSERT INTO menu_toppings
          (menu_id, topping_id, required, max_quantity, tenant_id, store_id)
          VALUES ${mtValues.join(",")}
        `, mtParams);
      }

      await client.query("COMMIT");

      res.json({
        message: "✅ Import FULL siêu nhanh 🚀",
        menu: menus.length,
        toppings: toppings.length,
        links: menuToppings.length
      });

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("IMPORT ERROR:", err);
      res.status(500).json({ message: err.message });
    } finally {
      client.release();
      fs.unlinkSync(req.file.path);
    }
  }
);

export default router;