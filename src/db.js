import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// pool.connect()
//   .then(() => console.log("✅ DB connected"))
//   .catch(err => console.error("❌ DB connection error:", err));