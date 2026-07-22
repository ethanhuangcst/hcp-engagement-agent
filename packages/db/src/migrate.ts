import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, ensureDatabase, getPool } from "./client.js";
import { loadRootEnv } from "./load-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  "001_mvp1_twins.sql",
  "002_mvp4_rag.sql",
  "003_mvp4_engagement.sql",
  "004_agent_general_workspace.sql",
];

/** Split SQL file into executable statements (skip empty / comment-only). */
function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const withoutComments = s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim();
      return withoutComments.length > 0;
    });
}

async function main(): Promise<void> {
  // Prefer repo .env over inherited shell DATABASE_URL (often leftover postgres).
  const envPath = join(__dirname, "../../../.env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m) {
        process.env.DATABASE_URL = m[1]!.trim().replace(/^["']|["']$/g, "");
        break;
      }
    }
  }
  loadRootEnv(join(__dirname, "../../.."));
  await ensureDatabase();
  const pool = getPool();
  for (const name of MIGRATIONS) {
    const sqlPath = join(__dirname, "../migrations", name);
    const sql = readFileSync(sqlPath, "utf8");
    for (const stmt of splitStatements(sql)) {
      await pool.query(stmt);
    }
    console.log(`Migrated: ${name}`);
  }
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
