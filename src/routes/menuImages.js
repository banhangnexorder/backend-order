import express from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { pool } from "../db.js";
import { normalizeText } from "../utils/normalizeText.js";

const router = express.Router();

const uploadTemp = "src/uploads/tmp";
const uploadFinal = "src/uploads/menu";

/* ===== ENSURE DIR ===== */
[uploadTemp, uploadFinal].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/* ===== MULTER ===== */
const upload = multer({
  dest: uploadTemp,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB / ảnh
});

/* ===== UPLOAD MENU IMAGES ===== */
router.post(
  "/upload",
  upload.array("images", 50),
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "❌ Không có ảnh" });
    }

    const client = await pool.connect();
    let matched = [];
    let notMatched = [];

    try {
      for (const file of req.files) {
        const rawName = path.parse(file.originalname).name;
        const imageKey = normalizeText(rawName); // ca_phe_den

        // 🔍 match menu theo image key
        const { rows } = await client.query(
          `SELECT id, name FROM menu_items WHERE image = $1`,
          [imageKey]
        );

        if (!rows.length) {
          notMatched.push(rawName);
          fs.unlinkSync(file.path);
          continue;
        }

        const item = rows[0];
        const finalName = `${imageKey}.webp`;
        const finalPath = path.join(uploadFinal, finalName);

        await sharp(file.path)
          .resize(600, 600, { fit: "cover" })
          .webp({ quality: 80 })
          .toFile(finalPath);

        fs.unlinkSync(file.path);

        matched.push({
          product: item.name,
          image: finalName
        });
      }

      res.json({
        total: req.files.length,
        matched: matched.length,
        matchedItems: matched,
        notMatched
      });
    } catch (err) {
      console.error("UPLOAD IMAGE ERROR:", err);
      res.status(500).json({ message: "❌ Lỗi xử lý ảnh" });
    } finally {
      client.release();
    }
  }
);

export default router;
