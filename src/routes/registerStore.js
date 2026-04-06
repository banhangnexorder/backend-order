import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import jwt from "jsonwebtoken";

const router = express.Router();

router.post("/", async (req, res) => {
  const { store_name, username, password } = req.body;

  /* ===== VALIDATE ===== */
  if (!store_name || !username || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* ===== CHECK USERNAME ===== */
    const checkUser = await client.query(
      `SELECT id FROM users WHERE username = $1`,
      [username]
    );

    if (checkUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Username đã tồn tại" });
    }

    /* ===== 0. CREATE TENANT ===== */
    const tenantRes = await client.query(
      `INSERT INTO tenants (tenant) VALUES ($1) RETURNING id`,
      [store_name] // dùng tên quán luôn
    );

    const tenant_id = tenantRes.rows[0].id;

    /* ===== 1. CREATE STORE ===== */
    const storeRes = await client.query(
      `INSERT INTO stores (name, tenant_id) VALUES ($1, $2) RETURNING id`,
      [store_name, tenant_id]
    );

    const store_id = storeRes.rows[0].id;

    /* ===== 2. HASH PASSWORD ===== */
    const hashed = await bcrypt.hash(password, 10);

    /* ===== 3. CREATE ADMIN ===== */
    await client.query(
      `
      INSERT INTO users (username, password, role, store_id)
      VALUES ($1, $2, 'admin', $3)
      `,
      [username, hashed, store_id]
    );

    await client.query("COMMIT");

    /* ===== 4. TOKEN ===== */
    const token = jwt.sign(
      { role: "admin", store_id },
      process.env.JWT_SECRET
    );

    return res.json({
      message: "✅ Tạo cửa hàng thành công",
      token,
      store_id
    });

  } catch (err) {
    await client.query("ROLLBACK");

    console.error("🔥 REGISTER ERROR:", err.message);
    console.error(err);

    return res.status(500).json({
      message: err.message // 👈 trả lỗi thật để debug
    });
  } finally {
    client.release();
  }
});

export default router;