import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: "../../backend/.env.development" });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : { rejectUnauthorized: false }
});

async function run() {
  try {
    await pool.query("ALTER TABLE menu_items ADD COLUMN price_s INTEGER DEFAULT 0;");
    console.log("Added price_s column");
  } catch (err) { console.log(err.message); }
  
  try {
    await pool.query("ALTER TABLE menu_items ADD COLUMN price_m INTEGER DEFAULT 0;");
    console.log("Added price_m column");
  } catch (err) { console.log(err.message); }

  try {
    await pool.query("ALTER TABLE menu_items ADD COLUMN price_l INTEGER DEFAULT 0;");
    console.log("Added price_l column");
  } catch (err) { console.log(err.message); }

  console.log("Migration complete!");
  process.exit(0);
}
run();
