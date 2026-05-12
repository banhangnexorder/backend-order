import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: "../../backend/.env.development" });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : { rejectUnauthorized: false } // Force ssl for neon
});

async function run() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'menu_items';
  `);
  console.log(res.rows);
  process.exit(0);
}
run();
