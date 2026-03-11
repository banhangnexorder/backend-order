import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { pool } from "../db.js";
import { normalizeText } from "../utils/normalizeText.js";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

const upload = multer({
  dest: "tmp/",
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post("/upload", upload.array("images", 50), async (req, res) => {

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "❌ Không có ảnh" });
  }

  const client = await pool.connect();

  let matched = [];
  let notMatched = [];

  try {

    for (const file of req.files) {

      const rawName = path.parse(file.originalname).name;
      const imageKey = normalizeText(rawName);

      const { rows } = await client.query(
        `
        SELECT id, name, store_id
        FROM menu_items
        WHERE image = $1
        `,
        [imageKey]
      );

      if (!rows.length) {
        notMatched.push(rawName);
        fs.unlinkSync(file.path);
        continue;
      }

      const item = rows[0];

      /* ===== UPLOAD CLOUDINARY ===== */

      const result = await cloudinary.uploader.upload(file.path, {
        folder: `menu/store_${item.store_id}`,
        public_id: imageKey,
        overwrite: true
      });

      fs.unlinkSync(file.path);

      const imageUrl = result.secure_url;

      /* ===== UPDATE DB ===== */

      await client.query(
        `
        UPDATE menu_items
        SET image = $1
        WHERE id = $2
        `,
        [imageUrl, item.id]
      );

      matched.push({
        product: item.name,
        store_id: item.store_id,
        image: imageUrl
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

    res.status(500).json({
      message: "❌ Lỗi upload ảnh"
    });

  } finally {

    client.release();

  }
});

export default router;