import express from "express";
import crypto from "crypto";
import { pool } from "../db.js";

const router = express.Router();

function generateShortCode(length = 6) {
  return crypto.randomBytes(4).toString("hex").slice(0, length);
}

router.get("/generate", async (req, res) => {
  const { store_id, table_id } = req.query;

  if (!store_id || !table_id) {
    return res.status(400).json({ error: "Missing params" });
  }

  try {
    const code = generateShortCode(6);

    await pool.query(
      `
      INSERT INTO qr_codes (code, store_id, table_id)
      VALUES ($1,$2,$3)
      `,
      [code, store_id, table_id]
    );

    res.json({
      code,
      url: `${process.env.FRONTEND_URL}/menu?c=${code}` // 🔥 NGẮN GỌN
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "QR generate error" });
  }
});

export default router;