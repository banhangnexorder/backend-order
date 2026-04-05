import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import jwt from "jsonwebtoken";

const router = express.Router();

router.post("/register-store", async (req, res) => {
  const { store_name, username, password } = req.body;

  if (!store_name || !username || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Tạo store
    const storeRes = await client.query(
      `INSERT INTO stores (name) VALUES ($1) RETURNING id`,
      [store_name]
    );

    const store_id = storeRes.rows[0].id;

    // 2. Hash password
    const hashed = await bcrypt.hash(password, 10);

    // 3. Tạo admin
    await client.query(
      `
      INSERT INTO users (username, password, role, store_id)
      VALUES ($1, $2, 'admin', $3)
      `,
      [username, hashed, store_id]
    );

    await client.query("COMMIT");

    // 4. Tạo token login luôn
    const token = jwt.sign(
      { role: "admin", store_id },
      process.env.JWT_SECRET
    );

    res.json({
      message: "✅ Tạo cửa hàng thành công",
      token,
      store_id
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "❌ Error create store" });
  } finally {
    client.release();
  }
});

export default router;