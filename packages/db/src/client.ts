import mysql from "mysql2/promise";
import type { Pool as MysqlPool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

export type QueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number;
};

/** Minimal pool surface used by @hca/db callers (formerly pg.Pool). */
export type DbPool = {
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
  end: () => Promise<void>;
};

let pool: MysqlPool | null = null;
let activeUrl: string | null = null;

function parseMysqlUrl(url: string): mysql.PoolOptions {
  const u = new URL(url);
  if (!/^mysql[s]?:$/i.test(u.protocol)) {
    throw new Error(
      `DATABASE_URL must be mysql://… (got ${u.protocol}). See specs/9.deploy.md`,
    );
  }
  const database = u.pathname.replace(/^\//, "") || undefined;
  // Remote MySQL often needs >10s on first connect (mysql2 default → ETIMEDOUT).
  const connectTimeout = Number(process.env.MYSQL_CONNECT_TIMEOUT_MS ?? 30_000);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE ?? 10),
    connectTimeout: Number.isFinite(connectTimeout) ? connectTimeout : 30_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    namedPlaceholders: false,
    dateStrings: false,
    // JSON columns come back as objects from mysql2
    typeCast(field, next) {
      if (field.type === "JSON") {
        const v = field.string("utf8");
        if (v == null) return null;
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      }
      return next();
    },
  };
}

export function getPool(connectionString?: string): DbPool {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  // Recreate pool if DATABASE_URL changed (e.g. stale postgresql:// cleared by loadRootEnv).
  if (pool && activeUrl && activeUrl !== url) {
    void pool.end().catch(() => undefined);
    pool = null;
    activeUrl = null;
  }
  if (pool) return wrap(pool);
  activeUrl = url;
  pool = mysql.createPool(parseMysqlUrl(url));
  return wrap(pool);
}

function wrap(p: MysqlPool): DbPool {
  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<QueryResult<T>> {
      const run = async () => {
        const [result] = await p.execute(
          sql,
          params as (string | number | boolean | Date | null | Buffer)[],
        );
        if (Array.isArray(result)) {
          return {
            rows: result as T[],
            rowCount: result.length,
          };
        }
        const header = result as ResultSetHeader;
        return { rows: [] as T[], rowCount: header.affectedRows ?? 0 };
      };
      try {
        return await run();
      } catch (err) {
        // One retry on transient remote timeouts / dropped keepalives.
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : "";
        if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "PROTOCOL_CONNECTION_LOST") {
          return await run();
        }
        throw err;
      }
    },
    async end() {
      await p.end();
    },
  };
}

export async function pingDatabase(connectionString?: string): Promise<boolean> {
  try {
    const p = getPool(connectionString);
    const r = await p.query<{ ok: number }>("SELECT 1 AS ok");
    return Number(r.rows[0]?.ok) === 1;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  activeUrl = null;
}

/** Reset singleton (tests only). */
export function _resetPoolForTests(): void {
  pool = null;
  activeUrl = null;
}

/** Ensure database exists (connect without default schema). */
export async function ensureDatabase(connectionString?: string): Promise<void> {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const u = new URL(url);
  const database = u.pathname.replace(/^\//, "");
  if (!database) throw new Error("DATABASE_URL missing database name");
  const opts = parseMysqlUrl(url);
  delete opts.database;
  const conn = await mysql.createConnection(opts);
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, "``")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
}

export type { RowDataPacket, ResultSetHeader };
