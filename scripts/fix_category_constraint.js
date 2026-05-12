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
    await pool.query("ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_code_key;");
    console.log("Dropped categories_code_key constraint");
  } catch (err) { console.log("Failed to drop constraint:", err.message); }
  
  try {
    await pool.query("ALTER TABLE categories ADD CONSTRAINT categories_store_id_code_key UNIQUE (store_id, code);");
    console.log("Added unique constraint on (store_id, code)");
  } catch (err) { console.log("Failed to add constraint:", err.message); }

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
