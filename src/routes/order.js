import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { verifyQrToken } from "../middleware/verifyQrToken.js";

const router = express.Router();

/* ============================
   CREATE ORDER
============================ */
router.post("/", verifyQrToken, async (req, res) => {
  try {
    const { store_id, table_id } = req.qr;
    const { items = [], total } = req.body;

    const source = "qr"; // ✅ FIX

    const store = await pool.query(
      "SELECT tenant_id FROM stores WHERE id=$1",
      [store_id]
    );

    if (!store.rows.length) {
      return res.status(400).json({ error: "Store not found" });
    }

    const today = new Date().toISOString().slice(0, 10);

    /* ===== LOCK & INCREMENT ===== */
    const counter = await pool.query(
      `
      INSERT INTO order_counters (store_id, order_date, last_no)
      VALUES ($1, $2, 1)
      ON CONFLICT (store_id, order_date)
      DO UPDATE SET last_no = order_counters.last_no + 1
      RETURNING last_no
      `,
      [store_id, today]
    );

    const order_no = counter.rows[0].last_no;

    const tenant_id = store.rows[0].tenant_id;

    const areas = [...new Set(items.map(i => i.area).filter(Boolean))];

    const areasStatus =
      areas.length > 0
        ? areas.reduce((acc, a) => ({ ...acc, [a]: "pending" }), {})
        : {};

    const result = await pool.query(
      `
      INSERT INTO orders (
        tenant_id,
        store_id,
        table_id,
        source,
        items,
        total,
        status,
        areas_status,
        order_no,
        order_date
      )
      VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9)
      RETURNING *
      `,
      [
        tenant_id,
        store_id,
        table_id,
        source,
        JSON.stringify(items),
        total,
        JSON.stringify(areasStatus),
        order_no,
        today
      ]
    );

    const order = result.rows[0];

    const io = req.app.get("io");
    io.to(`store_${store_id}`).emit("new_order", order);

    res.json({ success: true, order });

  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   GET ORDERS
============================ */
router.get("/", verifyToken, async (req, res) => {

  const store_id = req.user.store_id;

  const result = await pool.query(
    `
    SELECT *
    FROM orders
    WHERE store_id=$1
    ORDER BY id DESC
    `,
    [store_id]
    );

    res.json(result.rows);
});

/* ============================
   UPDATE FULL ORDER
============================ */
router.put("/:id/status", verifyToken, async (req, res) => {
  const store_id = req.user.store_id;

  console.log("UPDATE ORDER DEBUG");
  console.log("status:", req.body.status);
  console.log("order id:", req.params.id);
  console.log("store_id from token:", store_id);

  try {
    const result = await pool.query(
      "UPDATE orders SET status=$1 WHERE id=$2 AND store_id=$3 RETURNING *",
      [req.body.status, req.params.id, store_id]
    );

    console.log("rows updated:", result.rows);

    const io = req.app.get("io");
    io.to(`store_${store_id}`).emit("order_updated", result.rows[0]);

    res.json({ success: true, order: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

/* ============================
   UPDATE AREA STATUS (🔥 FIX)
============================ */
router.put("/:id/area-status", verifyToken, async (req, res) => {
  const { area } = req.body;
  const orderId = req.params.id;
  const store_id = req.user.store_id;
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
      WHERE id=$1 AND store_id=$2
      RETURNING *
      `,
      [orderId, store_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }

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
    io.to(`store_${store_id}`).emit("order_updated", order);

    res.json({ success: true, order });
  } catch (err) {
    console.error("❌ AREA STATUS ERROR:", err);
    res.status(500).json({ error: "DB error" });
  }
});

export default router;
