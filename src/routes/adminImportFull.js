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

router.post("/import/full", upload.single("file"), async (req, res) => {

  const client = await pool.connect();

  try {
    /* =========================================
       0. AUTH → LẤY TENANT + STORE
    ========================================= */
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "Missing admin token" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET); //Lấy tenant/store từ token

    const tenantId = decoded.tenant_id;
    const storeId = decoded.store_id;

    if (!tenantId || !storeId) {
      throw new Error("Token thiếu tenant/store");
    }

    /* =========================================
       1. READ FILE
    ========================================= */
    const workbook = XLSX.readFile(req.file.path);

    const menuSheet = workbook.Sheets["menu"];
    const toppingSheet = workbook.Sheets["toppings"];
    const menuToppingSheet = workbook.Sheets["menu_toppings"];

    if (!menuSheet || !toppingSheet || !menuToppingSheet) {
      throw new Error("File thiếu sheet");
    }

    const menus = XLSX.utils.sheet_to_json(menuSheet, { defval: "" });
    const toppings = XLSX.utils.sheet_to_json(toppingSheet, { defval: "" });
    const menuToppings = XLSX.utils.sheet_to_json(menuToppingSheet, { defval: "" });

    const overwrite = req.body.overwrite === "true";

    await client.query("BEGIN");

    /* =========================================
       2. IMPORT TOPPINGS (UPSERT)
    ========================================= */
    for (const row of toppings) {

      const name = row.name?.trim();
      if (!name) continue;

      const normalized = normalizeText(name);

      await client.query(
        `
        INSERT INTO toppings 
        (name, normalized_name, price, is_active, tenant_id, store_id)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (normalized_name, tenant_id)
        DO UPDATE SET
          price = EXCLUDED.price,
          is_active = EXCLUDED.is_active
        `,
        [
          name,
          normalized,
          Number(row.price) || 0,
          Number(row.is_active) === 1,
          tenantId,
          storeId
        ]
      );
    }

    /* =========================================
       3. OVERWRITE MENU
    ========================================= */
    if (overwrite) {
      await client.query("DELETE FROM menu_toppings WHERE tenant_id = $1", [tenantId]);
      await client.query("DELETE FROM menu_items WHERE tenant_id = $1", [tenantId]);
    }

    /* =========================================
       4. IMPORT MENU
    ========================================= */
    for (const row of menus) {

      const name = row.name?.trim();
      if (!name) continue;

      const image = normalizeText(name);

      const categoryId = row.category_id?.trim();

      const cat = await client.query(
        "SELECT id FROM categories WHERE id = $1 AND tenant_id = $2",
        [categoryId, tenantId]
      );

      if (!cat.rowCount) {
        throw new Error(`Category không tồn tại: ${categoryId}`);
      }

      await client.query(
        `
        INSERT INTO menu_items
        (name, price, area, category_id, image, sort_order, is_active, tenant_id, store_id)
        VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8)
        `,
        [
          name,
          Number(row.price) || 0,
          row.area,
          categoryId,
          image,
          Number(row.sort_order) || 0,
          tenantId,
          storeId
        ]
      );
    }

    /* =========================================
       5. IMPORT MENU_TOPPINGS
    ========================================= */
    for (const row of menuToppings) {

      const menuImage = normalizeText(row.menu_name || "");
      const toppingNorm = normalizeText(row.topping_name || "");

      if (!menuImage || !toppingNorm) continue;

      const menu = await client.query(
        "SELECT id FROM menu_items WHERE image = $1 AND tenant_id = $2",
        [menuImage, tenantId]
      );

      const topping = await client.query(
        "SELECT id FROM toppings WHERE normalized_name = $1 AND tenant_id = $2",
        [toppingNorm, tenantId]
      );

      if (!menu.rowCount || !topping.rowCount) continue;

      await client.query(
        `
        INSERT INTO menu_toppings
        (menu_id, topping_id, required, max_quantity, tenant_id)
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          menu.rows[0].id,
          topping.rows[0].id,
          Number(row.required) === 1,
          Number(row.max_quantity) || 1,
          tenantId
        ]
      );
    }

    await client.query("COMMIT");

    res.json({
      message: "✅ Import thành công",
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
});

export default router;