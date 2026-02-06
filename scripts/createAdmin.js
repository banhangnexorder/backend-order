import bcrypt from "bcrypt";
import { pool } from "../src/db.js";

async function createUser(username, password, role) {
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `
    INSERT INTO users (username, password, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (username) DO NOTHING
    `,
    [username, hash, role]
  );

  console.log(`✅ Created ${role}: ${username}`);
}

(async () => {
  await createUser("admin", "123456", "admin");
  await createUser("staff", "123456", "staff");
  await createUser("kitchen", "123456", "kitchen");
  process.exit();
})();
