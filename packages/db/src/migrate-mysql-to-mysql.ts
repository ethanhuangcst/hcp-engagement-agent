/**
 * Copy rows between two MySQL instances (same schema).
 *
 * Env:
 *   SOURCE_DATABASE_URL  mysql://…  (default: previous HK host from .env.mysql-old or sibling)
 *   DATABASE_URL         mysql://…  (target; repo .env)
 *
 * Usage: npx tsx packages/db/src/migrate-mysql-to-mysql.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { closePool, ensureDatabase, getPool } from "./client.js";
import { loadRootEnv } from "./load-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");

const TABLES_ORDER = [
  "hcp_twins",
  "hcp_insights",
  "ingest_manifest",
  "rag_ingest_jobs",
  "engagement_options",
  "chat_sessions",
] as const;

function readEnvKey(filePath: string, key: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(new RegExp(`^${key}=(.*)$`));
    if (m) return m[1]!.trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

function parseMysqlUrl(url: string): mysql.ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || undefined,
    connectTimeout: 30_000,
  };
}

function jsonCell(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      JSON.parse(v);
      return v;
    } catch {
      return JSON.stringify(v);
    }
  }
  return JSON.stringify(v);
}

function dateCell(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function datetimeCell(v: unknown): Date | string | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  return new Date(String(v));
}

async function main(): Promise<void> {
  const targetFromFile = readEnvKey(join(ROOT, ".env"), "DATABASE_URL");
  if (targetFromFile?.startsWith("mysql")) {
    process.env.DATABASE_URL = targetFromFile;
  } else {
    loadRootEnv(ROOT);
  }

  const sourceUrl =
    process.env.SOURCE_DATABASE_URL ??
    readEnvKey(join(ROOT, ".env.mysql-old"), "DATABASE_URL") ??
    "mysql://root:11qqQQ%40%40@187.127.125.236:3306/hca";

  if (!sourceUrl.startsWith("mysql")) {
    throw new Error("SOURCE_DATABASE_URL must be mysql://…");
  }
  if (!process.env.DATABASE_URL?.startsWith("mysql")) {
    throw new Error("Target DATABASE_URL must be mysql://… in repo .env");
  }
  if (sourceUrl === process.env.DATABASE_URL) {
    throw new Error("SOURCE and target DATABASE_URL are identical");
  }

  console.log("Source:", sourceUrl.replace(/:[^:@]+@/, ":***@"));
  console.log("Target:", process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@"));

  await ensureDatabase();
  const { spawnSync } = await import("node:child_process");
  const mig = spawnSync("npx", ["tsx", "src/migrate.ts"], {
    cwd: join(ROOT, "packages/db"),
    env: process.env,
    stdio: "inherit",
  });
  if (mig.status !== 0) throw new Error("MySQL schema migrate failed");

  const src = await mysql.createConnection(parseMysqlUrl(sourceUrl));
  const dst = getPool();

  const counts: Record<string, { src: number; dst: number }> = {};

  try {
    await dst.query("SET FOREIGN_KEY_CHECKS = 0");

    for (const table of TABLES_ORDER) {
      const [rows] = await src.query(`SELECT * FROM ${table}`);
      const list = rows as Record<string, unknown>[];
      console.log(`Copy ${table}: ${list.length} rows`);
      await dst.query(`DELETE FROM ${table}`);

      for (const row of list) {
        if (table === "hcp_twins") {
          await dst.query(
            `INSERT INTO hcp_twins
              (hcp_id, identity, twin, tags, as_of, twin_version, schema_version, created_at, updated_at)
             VALUES (?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, ?, ?)
             AS new
             ON DUPLICATE KEY UPDATE
               identity = new.identity, twin = new.twin, tags = new.tags,
               as_of = new.as_of, twin_version = new.twin_version,
               schema_version = new.schema_version,
               created_at = new.created_at, updated_at = new.updated_at`,
            [
              row.hcp_id,
              jsonCell(row.identity),
              jsonCell(row.twin),
              jsonCell(row.tags),
              dateCell(row.as_of),
              row.twin_version,
              row.schema_version,
              datetimeCell(row.created_at),
              datetimeCell(row.updated_at),
            ],
          );
        } else if (table === "hcp_insights") {
          await dst.query(
            `INSERT INTO hcp_insights (hcp_id, payload, as_of, created_at, updated_at)
             VALUES (?, CAST(? AS JSON), ?, ?, ?)
             AS new
             ON DUPLICATE KEY UPDATE
               payload = new.payload, as_of = new.as_of,
               created_at = new.created_at, updated_at = new.updated_at`,
            [
              row.hcp_id,
              jsonCell(row.payload),
              dateCell(row.as_of),
              datetimeCell(row.created_at),
              datetimeCell(row.updated_at),
            ],
          );
        } else if (table === "ingest_manifest") {
          await dst.query(
            `INSERT INTO ingest_manifest
              (doc_id, index_name, specialty, version, as_of, corpus_path, chunk_count, authority, metadata, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)
             AS new
             ON DUPLICATE KEY UPDATE
               index_name = new.index_name, specialty = new.specialty,
               version = new.version, as_of = new.as_of,
               corpus_path = new.corpus_path, chunk_count = new.chunk_count,
               authority = new.authority, metadata = new.metadata,
               created_at = new.created_at, updated_at = new.updated_at`,
            [
              row.doc_id,
              row.index_name,
              row.specialty ?? null,
              row.version,
              dateCell(row.as_of),
              row.corpus_path ?? null,
              row.chunk_count ?? 0,
              row.authority ?? null,
              jsonCell(row.metadata ?? {}),
              datetimeCell(row.created_at),
              datetimeCell(row.updated_at),
            ],
          );
        } else if (table === "rag_ingest_jobs") {
          await dst.query(
            `INSERT INTO rag_ingest_jobs
              (job_id, specialty, hcp_id, status, progress, error, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)
             AS new
             ON DUPLICATE KEY UPDATE
               specialty = new.specialty, hcp_id = new.hcp_id, status = new.status,
               progress = new.progress, error = new.error,
               created_at = new.created_at, updated_at = new.updated_at`,
            [
              row.job_id,
              row.specialty ?? null,
              row.hcp_id ?? null,
              row.status,
              row.progress ?? null,
              jsonCell(row.error),
              datetimeCell(row.created_at),
              datetimeCell(row.updated_at),
            ],
          );
        } else if (table === "engagement_options") {
          await dst.query(
            `INSERT INTO engagement_options (run_id, hcp_id, payload, as_of, created_at, updated_at)
             VALUES (?, ?, CAST(? AS JSON), ?, ?, ?)
             AS new
             ON DUPLICATE KEY UPDATE
               hcp_id = new.hcp_id, payload = new.payload, as_of = new.as_of,
               created_at = new.created_at, updated_at = new.updated_at`,
            [
              row.run_id,
              row.hcp_id,
              jsonCell(row.payload),
              dateCell(row.as_of),
              datetimeCell(row.created_at),
              datetimeCell(row.updated_at),
            ],
          );
        } else if (table === "chat_sessions") {
          await dst.query(
            `INSERT INTO chat_sessions
              (session_id, hcp_id, mode, option_run_id, payload, as_of, created_at, updated_at)
             VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)
             AS new
             ON DUPLICATE KEY UPDATE
               hcp_id = new.hcp_id, mode = new.mode, option_run_id = new.option_run_id,
               payload = new.payload, as_of = new.as_of,
               created_at = new.created_at, updated_at = new.updated_at`,
            [
              row.session_id,
              row.hcp_id,
              row.mode,
              row.option_run_id ?? null,
              jsonCell(row.payload),
              dateCell(row.as_of),
              datetimeCell(row.created_at),
              datetimeCell(row.updated_at),
            ],
          );
        }
      }

      const dstCount = await dst.query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM ${table}`,
      );
      counts[table] = { src: list.length, dst: Number(dstCount.rows[0]?.c ?? 0) };
    }

    await dst.query("SET FOREIGN_KEY_CHECKS = 1");

    console.log("\nCount check:");
    let ok = true;
    for (const [t, c] of Object.entries(counts)) {
      const mark = c.src === c.dst ? "ok" : "MISMATCH";
      if (c.src !== c.dst) ok = false;
      console.log(`  ${t}: src=${c.src} dst=${c.dst} [${mark}]`);
    }
    if (!ok) throw new Error("Row count mismatch after copy");
    console.log("\nMySQL→MySQL migration complete.");
  } finally {
    await src.end();
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
