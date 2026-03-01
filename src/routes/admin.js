import express from "express";
import { pool } from "../db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

// ===== TIMEZONE VN HELPER =====
function todayVN() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }); // YYYY-MM-DD
}

const router = express.Router();

/* =====================
   🔐 BẢO MẬT CHUNG
   → Tất cả route bên dưới chỉ ADMIN vào được
===================== */
// router.use(auth, allowRoles("admin"));
router.use(verifyToken);
router.use(requireRole("admin"));

/* ===== PROTECT ALL ROUTES BELOW ===== */
router.use(verifyToken, requireRole("admin"));

/* =====================
   ADMIN STATS (HÔM NAY)
===================== */
router.get("/stats", async (req, res) => {
  try {
    const vnToday = todayVN();

    const totalOrders = await pool.query(
      `
      SELECT COUNT(*) 
      FROM orders 
      WHERE (created_at AT TIME ZONE 'UTC'
             AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1
      `,
      [vnToday]
    );

    const pendingOrders = await pool.query(
      `
      SELECT COUNT(*) 
      FROM orders 
      WHERE status = 'pending'
        AND (created_at AT TIME ZONE 'UTC'
             AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1
      `,
      [vnToday]
    );

    const doneOrders = await pool.query(
      `
      SELECT COUNT(*) 
      FROM orders 
      WHERE status = 'done'
        AND (created_at AT TIME ZONE 'UTC'
             AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1
      `,
      [vnToday]
    );

    const revenue = await pool.query(
      `
      SELECT COALESCE(SUM(total_price), 0) 
      FROM orders 
      WHERE status = 'done'
        AND (created_at AT TIME ZONE 'UTC'
             AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1
      `,
      [vnToday]
    );

    res.json({
      totalOrders: totalOrders.rows[0].count,
      pendingOrders: pendingOrders.rows[0].count,
      doneOrders: doneOrders.rows[0].count,
      revenue: revenue.rows[0].coalesce,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stats error" });
  }
});

/* =====================
   ADMIN ORDERS (FILTER)
===================== */
router.get("/orders", async (req, res) => {
  try {
    let { status, from, to } = req.query;

    let query = `
      SELECT *
      FROM orders
      WHERE 1=1
    `;

    const params = [];
    let i = 1;

    if (status) {
      query += ` AND status = $${i++}`;
      params.push(status);
    }

    if (from) {
      query += `
        AND (created_at AT TIME ZONE 'UTC'
             AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $${i++}
      `;
      params.push(from);
    }

    if (to) {
      query += `
        AND (created_at AT TIME ZONE 'UTC'
             AT TIME ZONE 'Asia/Ho_Chi_Minh') <= $${i++}
      `;
      params.push(to);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Orders error" });
  }
});

/* =====================
   ADMIN DASHBOARD (RANGE)
===================== */
router.get("/dashboard", async (req, res) => {
  try {
    let { from, to } = req.query;

    const vnToday = todayVN();

    const fromDate = from || vnToday;
    const toDate = to || vnToday;

    const result = await pool.query(
      `
      SELECT 
        DATE(created_at AT TIME ZONE 'UTC'
             AT TIME ZONE 'Asia/Ho_Chi_Minh') as date,
        COUNT(*) as orders,
        SUM(total_price) as revenue
      FROM orders
      WHERE (created_at AT TIME ZONE 'UTC'
             AT TIME ZONE 'Asia/Ho_Chi_Minh')
            BETWEEN $1 AND $2
      GROUP BY date
      ORDER BY date
      `,
      [fromDate, toDate]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Dashboard error" });
  }
});

export default router;
