import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE username=$1",
    [username]
  );

  const user = result.rows[0];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid login" });
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role, // admin | staff | kitchen
    },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token, role: user.role });
});

export default router;
