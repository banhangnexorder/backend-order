import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { pool } from "../db.js";
import cloudinary from "../config/cloudinary.js";
import { normalizeText } from "../utils/normalizeText.js";

const router = express.Router();

/* ===== MULTER TEMP ===== */

const upload = multer({
  dest: "tmp/",
  limits: { fileSize: 5 * 1024 * 1024 }
});

/* ===== UPLOAD MENU IMAGES ===== */

router.post("/upload", upload.array("images", 50), async (req, res) => {

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "Không có ảnh" });
  }

  const store_id = req.user.store_id;

  const client = await pool.connect();

  let matched = [];
  let notMatched = [];

  try {

    for (const file of req.files) {

      const rawName = path.parse(file.originalname).name;

      const imageKey = normalizeText(rawName);

      /* tìm menu item */

      const { rows } = await client.query(
        `SELECT id, name FROM menu_items 
         WHERE image = $1 AND store_id = $2`,
        [imageKey, store_id]
      );

      if (!rows.length) {

        notMatched.push(rawName);

        fs.unlinkSync(file.path);

        continue;
      }

      const item = rows[0];

      /* upload cloudinary */

      const result = await cloudinary.uploader.upload(file.path, {

        folder: `stores/${store_id}/menu`,

        public_id: imageKey,

        overwrite: true

      });

      /* update db */

      await client.query(
        `UPDATE menu_items
         SET image = $1
         WHERE id = $2`,
        [result.secure_url, item.id]
      );

      fs.unlinkSync(file.path);

      matched.push({
        product: item.name,
        image: result.secure_url
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

    res.status(500).json({ message: "Lỗi upload ảnh" });

  } finally {

    client.release();

  }

});

export default router;