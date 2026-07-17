import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(connectionString?: string): pg.Pool {
  if (pool) return pool;
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  pool = new Pool({ connectionString: url, max: 10 });
  return pool;
}

export async function pingDatabase(connectionString?: string): Promise<boolean> {
  try {
    const p = getPool(connectionString);
    const r = await p.query("SELECT 1 AS ok");
    return r.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Reset singleton (tests only). */
export function _resetPoolForTests(): void {
  pool = null;
}
