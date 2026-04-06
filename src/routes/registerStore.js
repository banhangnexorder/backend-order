import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import jwt from "jsonwebtoken";

const router = express.Router();

router.post("/", async (req, res) => {
  const { store_name, username, password } = req.body;

  if (!store_name || !username || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 0. tạo tenant
    const tenantRes = await client.query(
    `INSERT INTO tenants DEFAULT VALUES RETURNING id`
    );

    const tenant_id = tenantRes.rows[0].id;

    // 1. tạo store
    const storeRes = await client.query(
    `INSERT INTO stores (name, tenant_id) VALUES ($1, $2) RETURNING id`,
    [store_name, tenant_id]
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