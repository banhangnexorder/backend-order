import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";

const { Pool } = pg;

async function migrateEnv(envFile) {
  if (!fs.existsSync(envFile)) return;
  console.log(`\n--- Migrating ${envFile} ---`);
  
  const envConfig = dotenv.parse(fs.readFileSync(envFile));
  const dbUrl = envConfig.DATABASE_URL;
  if (!dbUrl) return;

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Add columns if they don't exist
    await pool.query("ALTER TABLE categories ADD COLUMN IF NOT EXISTS tenant_id INTEGER;");
    await pool.query("ALTER TABLE categories ADD COLUMN IF NOT EXISTS store_id INTEGER;");
    console.log("Added tenant_id and store_id columns");

    // For existing rows, we can just set them to some default or leave them null.
    // If they are null, the UNIQUE (store_id, code) constraint might treat nulls as distinct or the same.
    // In PostgreSQL, nulls are distinct in unique constraints (unless NULLS NOT DISTINCT is specified in PG 15+).

    // Let's drop the old constraint just in case it wasn't dropped
    await pool.query("ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_code_key;");
    console.log("Dropped categories_code_key constraint");

    // Add the new constraint
    await pool.query("ALTER TABLE categories ADD CONSTRAINT categories_store_id_code_key UNIQUE (store_id, code);");
    console.log("Added categories_store_id_code_key constraint");

  } catch (err) { console.log("Failed:", err.message); }

  await pool.end();
}

async function run() {
  await migrateEnv(".env.development");
  await migrateEnv(".env.staging");
  await migrateEnv(".env.production");
  process.exit(0);
}

run();
