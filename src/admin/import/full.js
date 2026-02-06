import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";

const router = express.Router();
const upload = multer({ dest: "src/uploads/tmp" });

router.post("/full", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "❌ Chưa upload file" });
  }

  const errors = [];

  try {
    const workbook = XLSX.readFile(req.file.path);

    /* ===== 1. CHECK SHEET ===== */
    const requiredSheets = ["menu", "toppings", "menu_toppings"];
    for (const s of requiredSheets) {
      if (!workbook.Sheets[s]) {
        errors.push(`❌ Thiếu sheet "${s}"`);
      }
    }

    if (errors.length) {
      return res.status(400).json({ errors });
    }

    /* ===== 2. READ DATA ===== */
    const menuRows = XLSX.utils.sheet_to_json(workbook.Sheets.menu);
    const toppingRows = XLSX.utils.sheet_to_json(workbook.Sheets.toppings);
    const linkRows = XLSX.utils.sheet_to_json(workbook.Sheets.menu_toppings);

    /* ===== 3. VALIDATE MENU ===== */
    menuRows.forEach((row, i) => {
      const line = i + 2;

      if (!row.name) errors.push(`menu!A${line}: thiếu name`);
      if (isNaN(row.price)) errors.push(`menu!B${line}: price phải là số`);
      if (!["bar", "kitchen"].includes(row.area))
        errors.push(`menu!C${line}: area phải là bar/kitchen`);
      if (!row.category_id)
        errors.push(`menu!D${line}: thiếu category_id`);
    });

    /* ===== 4. VALIDATE TOPPINGS ===== */
    toppingRows.forEach((row, i) => {
      const line = i + 2;

      if (!row.name) errors.push(`toppings!A${line}: thiếu name`);
      if (isNaN(row.price))
        errors.push(`toppings!B${line}: price phải là số`);
    });

    /* ===== 5. VALIDATE MENU_TOPPINGS ===== */
    linkRows.forEach((row, i) => {
      const line = i + 2;

      if (!row.menu_name)
        errors.push(`menu_toppings!A${line}: thiếu menu_name`);
      if (!row.topping_name)
        errors.push(`menu_toppings!B${line}: thiếu topping_name`);
    });

    /* ===== ❌ CÓ LỖI ===== */
    if (errors.length) {
      return res.status(400).json({
        message: "❌ File Excel không hợp lệ",
        errors,
      });
    }

    /* ===== ✅ OK ===== */
    res.json({
      message: "✅ File hợp lệ, sẵn sàng import",
      counts: {
        menu: menuRows.length,
        toppings: toppingRows.length,
        links: linkRows.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ Lỗi đọc file Excel" });
  } finally {
    fs.unlinkSync(req.file.path);
  }
});

export default router;
