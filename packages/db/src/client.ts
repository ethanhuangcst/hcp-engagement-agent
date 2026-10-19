import mysql from "mysql2/promise";
import type { Pool, RowDataPacket } from "mysql2/promise";

let pool: Pool | null = null;
let poolUrl: string | undefined;

/** 把 mysql:// 或 mysqls:// URL 解析为 mysql2 连接配置（ADR-005：仅 MySQL 运行时） */
export function mysqlConfigFromUrl(
  url: string,
  extra: mysql.ConnectionOptions = {},
): mysql.ConnectionOptions {
  const u = new URL(url);
  const protocol = u.protocol.replace(/:$/, "");
  if (protocol !== "mysql" && protocol !== "mysqls") {
    throw new Error(
      "DATABASE_URL 必须为 mysql:// 或 mysqls://（ADR-005），拒绝其他驱动 URL",
    );
  }
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ...(protocol === "mysqls" ? { ssl: {} } : {}),
    ...extra,
  };
}

/** JSON 列兜底解析：mysql2 视版本与配置可能返回字符串或对象 */
export function asJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

export function getPool(connectionString?: string): Pool {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  if (!pool || poolUrl !== url) {
    if (pool) void pool.end().catch(() => {});
    pool = mysql.createPool(
      mysqlConfigFromUrl(url, {
        waitForConnections: true,
        connectionLimit: 10,
        connectTimeout: 10_000,
        /** DATE / DATETIME / TIMESTAMP 以字符串返回，保持 as_of 为 'YYYY-MM-DD' */
        dateStrings: true,
      }),
    );
    poolUrl = url;
  }
  return pool;
}

export async function pingDatabase(connectionString?: string): Promise<boolean> {
  try {
    const p = getPool(connectionString);
    const [rows] = await p.query<RowDataPacket[]>("SELECT 1 AS ok");
    return rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    poolUrl = undefined;
  }
}

/** Reset singleton (tests only). */
export function _resetPoolForTests(): void {
  pool = null;
  poolUrl = undefined;
}
