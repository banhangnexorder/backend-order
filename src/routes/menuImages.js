import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { pool } from "../db.js";
import { normalizeText } from "../utils/normalizeText.js";

const router = express.Router();

/* ===== PATH CONFIG ===== */

const uploadTemp = "src/uploads/tmp";
const uploadFinal = "src/uploads/menu";

/* ===== ENSURE DIR ===== */

[uploadTemp, uploadFinal].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/* ===== MULTER CONFIG ===== */

const upload = multer({
  dest: uploadTemp,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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

        const imageKey = normalizeText(rawName);

        /* ===== FIND MENU ITEM ===== */

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

        /* ===== STORE FOLDER ===== */

        const storeDir = path.join(uploadFinal, `store_${item.store_id}`);

        if (!fs.existsSync(storeDir)) {
          fs.mkdirSync(storeDir, { recursive: true });
        }

        /* ===== FILE NAME ===== */

        const ext = path.extname(file.originalname).toLowerCase();

        const finalName = `${imageKey}${ext}`;

        const finalPath = path.join(storeDir, finalName);

        /* ===== MOVE FILE ===== */

        fs.renameSync(file.path, finalPath);

        /* ===== UPDATE DATABASE ===== */

        await client.query(
          `
          UPDATE menu_items
          SET image = $1
          WHERE id = $2
          `,
          [finalName, item.id]
        );

        matched.push({
          product: item.name,
          store_id: item.store_id,
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

      res.status(500).json({
        message: "❌ Lỗi xử lý ảnh"
      });

    } finally {

      client.release();

    }
  }
);

export default router;