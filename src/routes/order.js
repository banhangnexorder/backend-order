import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/* ============================
   CREATE ORDER
============================ */
router.post("/", async (req, res) => {
  const { store_id, table_id, source, items, total } = req.body;

  const areas = [...new Set(items.map(i => i.area).filter(Boolean))];

  const areasStatus =
    areas.length > 0
      ? areas.reduce((acc, a) => ({ ...acc, [a]: "pending" }), {})
      : {};

  try {
    const result = await pool.query(
      `
      INSERT INTO orders (
        store_id, table_id, source, items, total, status, areas_status
      )
      VALUES ($1,$2,$3,$4,$5,'pending',$6)
      RETURNING *
      `,
      [
        store_id,
        table_id,
        source,
        JSON.stringify(items),
        total,
        JSON.stringify(areasStatus),
      ]
    );

    const order = result.rows[0];
    const io = req.app.get("io");
    io.emit("new_order", order);

    res.json({ success: true, order });
  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* ============================
   GET ORDERS
============================ */
router.get("/:storeId", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM orders WHERE store_id=$1 ORDER BY id DESC",
      [req.params.storeId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   UPDATE FULL ORDER
============================ */
router.put("/:id/status", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE orders SET status=$1 WHERE id=$2 RETURNING *",
      [req.body.status, req.params.id]
    );

    const io = req.app.get("io");
    io.emit("order_updated", result.rows[0]);

    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

/* ============================
   UPDATE AREA STATUS (🔥 FIX)
============================ */
router.put("/:id/area-status", async (req, res) => {
  const { area } = req.body;
  const orderId = req.params.id;

  try {
    // 1️⃣ update khu hiện tại
    const result = await pool.query(
      `
      UPDATE orders
      SET areas_status = jsonb_set(
        areas_status,
        '{${area}}',
        '"done"',
        true
      )
      WHERE id=$1
      RETURNING *
      `,
      [orderId]
    );

    let order = result.rows[0];
    const areas = order.areas_status || {};
    const keys = Object.keys(areas);

    // 2️⃣ AUTO DONE LOGIC
    if (keys.length === 1) {
      // ✅ CHỈ 1 KHU → DONE ĐƠN
      const final = await pool.query(
        "UPDATE orders SET status='done' WHERE id=$1 RETURNING *",
        [orderId]
      );
      order = final.rows[0];
    } else {
      // ✅ NHIỀU KHU → ALL DONE?
      const allDone = keys.every(k => areas[k] === "done");
      if (allDone) {
        const final = await pool.query(
          "UPDATE orders SET status='done' WHERE id=$1 RETURNING *",
          [orderId]
        );
        order = final.rows[0];
      }
    }

    const io = req.app.get("io");
    io.emit("order_updated", order);

    res.json({ success: true, order });
  } catch (err) {
    console.error("❌ AREA STATUS ERROR:", err);
    res.status(500).json({ error: "DB error" });
  }
});

export default router;
