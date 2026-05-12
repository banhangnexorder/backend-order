import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";

const { Pool } = pg;

async function migrateEnv(envFile) {
  if (!fs.existsSync(envFile)) return;
  console.log(`\n--- Migrating ${envFile} ---`);
  
  const envConfig = dotenv.parse(fs.readFileSync(envFile));
  const dbUrl = envConfig.DATABASE_URL;
  
  if (!dbUrl) {
    console.log(`No DATABASE_URL found in ${envFile}`);
    return;
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

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

  await pool.end();
  console.log(`Finished ${envFile}`);
}

async function run() {
  await migrateEnv(".env.development");
  await migrateEnv(".env.staging");
  await migrateEnv(".env.production");
  process.exit(0);
}

run();
