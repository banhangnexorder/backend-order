import { pool } from "./src/db.js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.development" });

async function testDashboard() {
  try {
    const store_id = 1; // Assuming store_id 1
    const fromDate = '2026-05-12';

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
      WHERE store_id=$1
        AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $2
      `,
      [store_id, fromDate]
    );

    const lateOrders = await pool.query(
      `
      SELECT id, table_id,
        FLOOR(EXTRACT(EPOCH FROM (now() - created_at))/60) AS minutes
      FROM orders
      WHERE store_id=$1
        AND status='pending'
        AND now() - created_at > interval '15 minutes'
      ORDER BY minutes DESC
      `,
      [store_id]
    );

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
      WHERE store_id=$1
        AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $2
      GROUP BY day
      ORDER BY MIN(created_at)
      `,
      [store_id, fromDate]
    );
    console.log("SUCCESS!");
  } catch (err) {
    console.error("ERROR:", err);
  } finally {
    pool.end();
  }
}

testDashboard();
