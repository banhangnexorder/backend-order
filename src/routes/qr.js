// routes/qr.js
import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

router.get("/generate", (req, res) => {
  const { store_id, table_id } = req.query;

  if (!store_id || !table_id) {
    return res.status(400).json({ error: "Missing params" });
  }

  const token = jwt.sign(
    {
      store_id,
      table_id
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d"
    }
  );

  res.json({
    token,
    url: `${process.env.CLIENT_URL}/menu?t=${token}`
  });
});

export default router;