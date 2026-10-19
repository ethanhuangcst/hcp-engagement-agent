import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { mysqlConfigFromUrl } from "./client.js";
import { loadRootEnv } from "./load-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** MySQL 方言建表脚本（ADR-005；旧 Postgres 脚本仅作历史，默认不再执行） */
const MIGRATIONS = [
  "mysql/001_mvp1_twins.sql",
  "mysql/002_mvp4_rag.sql",
  "mysql/003_mvp4_engagement.sql",
  "mysql/004_agent_general_workspace.sql",
];

async function main(): Promise<void> {
  loadRootEnv(join(__dirname, "../../.."));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const conn = await mysql.createConnection(
    mysqlConfigFromUrl(url, { multipleStatements: true }),
  );
  try {
    for (const name of MIGRATIONS) {
      const sqlPath = join(__dirname, "../migrations", name);
      const sql = readFileSync(sqlPath, "utf8");
      await conn.query(sql);
      console.log(`Migrated: ${name}`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
