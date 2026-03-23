import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,

  // tối đa connection
  max: 10,

  // connection rảnh 30s sẽ đóng
  idleTimeoutMillis: 30000,

  // timeout khi connect
  connectionTimeoutMillis: 2000
});

// log pool
pool.on("connect", () => {
  console.log("🟢 DB connected");
});

pool.on("error", (err) => {
  console.error("🔴 DB error", err);
});