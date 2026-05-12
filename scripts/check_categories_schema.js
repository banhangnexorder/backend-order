import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";

const { Pool } = pg;

async function checkEnv(envFile) {
  if (!fs.existsSync(envFile)) return;
  console.log(`\n--- Checking ${envFile} ---`);
  
  const envConfig = dotenv.parse(fs.readFileSync(envFile));
  const dbUrl = envConfig.DATABASE_URL;
  if (!dbUrl) return;

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'categories';
    `);
    console.log(res.rows);
  } catch (err) { console.log("Failed:", err.message); }

  await pool.end();
}

async function run() {
  await checkEnv(".env.development");
  await checkEnv(".env.staging");
  await checkEnv(".env.production");
  process.exit(0);
}

run();
