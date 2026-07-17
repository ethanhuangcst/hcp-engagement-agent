import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "./client.js";
import { loadRootEnv } from "./load-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  loadRootEnv(join(__dirname, "../../.."));
  const sqlPath = join(__dirname, "../migrations/001_mvp1_twins.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const pool = getPool();
  await pool.query(sql);
  console.log("Migrated: 001_mvp1_twins.sql");
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
