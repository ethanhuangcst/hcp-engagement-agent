import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "./client.js";
import { loadRootEnv } from "./load-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  "001_mvp1_twins.sql",
  "002_mvp4_rag.sql",
  "003_mvp4_engagement.sql",
  "004_agent_general_workspace.sql",
];

async function main(): Promise<void> {
  loadRootEnv(join(__dirname, "../../.."));
  const pool = getPool();
  for (const name of MIGRATIONS) {
    const sqlPath = join(__dirname, "../migrations", name);
    const sql = readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    console.log(`Migrated: ${name}`);
  }
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
