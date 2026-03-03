import express from "express";
import { pool } from "../db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";


const router = express.Router();

/* =====================
   🔐 BẢO MẬT CHUNG
   → Tất cả route bên dưới chỉ ADMIN vào được
===================== */
router.use(verifyToken);
router.use(requireRole("admin", "staff"));

/* ===== PROTECT ALL ROUTES BELOW ===== */
// router.use(verifyToken, requireRole("admin"));

/* =====================
   ADMIN STATS (HÔM NAY)
===================== */
router.get("/stats", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalOrders = await pool.query(
      `
      SELECT COUNT(*) 
      FROM orders 
      WHERE created_at >= $1
      `,
      [today]
    );

    const pendingOrders = await pool.query(
      `
      SELECT COUNT(*) 
      FROM orders 
      WHERE status='pending' AND created_at >= $1
      `,
      [today]
    );

    const doneOrders = await pool.query(
      `
      SELECT COUNT(*) 
      FROM orders 
      WHERE status='done' AND created_at >= $1
      `,
      [today]
    );

    const cancelledOrders = await pool.query(
      `
      SELECT COUNT(*) 
      FROM orders 
      WHERE status='cancelled' AND created_at >= $1
      `,
      [today]
    );

    const revenue = await pool.query(
      `
      SELECT COALESCE(SUM(total),0) AS revenue
      FROM orders
      WHERE status='done' AND created_at >= $1
      `,
      [today]
    );

    const lateOrders = await pool.query(
      `
      SELECT id, table_id,
        FLOOR(EXTRACT(EPOCH FROM (now() - created_at))/60) AS minutes
      FROM orders
      WHERE status='pending'
        AND now() - created_at > interval '15 minutes'
      ORDER BY minutes DESC
      `
    );

    res.json({
      totalOrders: Number(totalOrders.rows[0].count),
      pendingOrders: Number(pendingOrders.rows[0].count),
      doneOrders: Number(doneOrders.rows[0].count),
      cancelledOrders: Number(cancelledOrders.rows[0].count),
      revenue: Number(revenue.rows[0].revenue),
      lateOrders: lateOrders.rows,
    });
  } catch (err) {
    console.error("❌ ADMIN STATS ERROR:", err);
    res.status(500).json({ error: "Admin stats error" });
  }
});

/* =====================
   ADMIN ORDERS (FILTER)
===================== */
router.get("/orders", async (req, res) => {
  const { from, to, status } = req.query;

  let where = [];
  let values = [];

  if (from) {
    values.push(from);
    where.push(`
      (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $${values.length}
    `);
  }

  if (to) {
    values.push(to);
    where.push(`
      (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $${values.length}
    `);
  }

  if (status && status !== "all") {
    values.push(status);
    where.push(`status = $${values.length}`);
  }

  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM orders
      ${whereSQL}
      ORDER BY created_at DESC
      `,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ ADMIN FILTER ERROR:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* =====================
   ADMIN DASHBOARD (RANGE)
===================== */
router.get("/dashboard", async (req, res) => {
  const { range = "today" } = req.query;

  try {
    /* =========================
       🇻🇳 LẤY NGÀY THEO GIỜ VIỆT NAM
    ========================== */
    const vnNow = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "Asia/Ho_Chi_Minh",
      })
    );

    let fromDate;

    if (range === "today") {
      fromDate = vnNow.toISOString().slice(0, 10);
    }

    if (range === "7days") {
      const d = new Date(vnNow);
      d.setDate(d.getDate() - 6);
      fromDate = d.toISOString().slice(0, 10);
    }

    if (range === "month") {
      fromDate = `${vnNow.getFullYear()}-${String(
        vnNow.getMonth() + 1
      ).padStart(2, "0")}-01`;
    }

    if (range === "year") {
      fromDate = `${vnNow.getFullYear()}-01-01`;
    }

    /* =========================
       🔥 SUMMARY (1 QUERY)
    ========================== */
    const summary = await pool.query(
      `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='pending') AS pending,
        COUNT(*) FILTER (WHERE status='done') AS done,
        COUNT(*) FILTER (WHERE status='cancelled') AS cancelled,
        COALESCE(
          SUM(CASE WHEN status='done' THEN total END),
          0
        ) AS revenue
      FROM orders
      WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $1
      `,
      [fromDate]
    );

    const row = summary.rows[0];

    /* =========================
       LATE ORDERS
    ========================== */
    const lateOrders = await pool.query(
      `
      SELECT id, table_id,
        FLOOR(EXTRACT(EPOCH FROM (now() - created_at))/60) AS minutes
      FROM orders
      WHERE status='pending'
        AND now() - created_at > interval '15 minutes'
      ORDER BY minutes DESC
      `
    );

    /* =========================
       CHART DATA
    ========================== */
    const chartData = await pool.query(
      `
      SELECT 
        to_char(
          created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
          'DD/MM'
        ) AS day,
        COUNT(*) AS orders,
        COALESCE(
          SUM(CASE WHEN status='done' THEN total END),
          0
        ) AS revenue
      FROM orders
      WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $1
      GROUP BY day
      ORDER BY MIN(created_at)
      `,
      [fromDate]
    );

    res.json({
      totalOrders: Number(row?.total || 0),
      pendingOrders: Number(row?.pending || 0),
      doneOrders: Number(row?.done || 0),
      cancelledOrders: Number(row?.cancelled || 0),
      revenue: Number(row?.revenue || 0),
      lateOrders: lateOrders.rows,
      chart: chartData.rows,
    });

  } catch (err) {
    console.error("❌ DASHBOARD ERROR:", err);
    res.status(500).json({ error: "Dashboard error" });
  }
});

export default router;
