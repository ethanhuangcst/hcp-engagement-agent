import { randomUUID } from "node:crypto";
import { getPool } from "@hca/db";
import type { RowDataPacket } from "mysql2/promise";

export type IngestJobStatus =
  | "pending"
  | "running"
  | "ready"
  | "sparse"
  | "failed";

export interface IngestJobRow extends RowDataPacket {
  job_id: string;
  specialty: string | null;
  hcp_id: string | null;
  status: IngestJobStatus;
  progress: number | null;
  error: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

const IN_PROGRESS: IngestJobStatus[] = ["pending", "running"];

/** error JSON 列容错读取：mysql2 可能返回字符串或对象，非法 JSON 回退 null（US-RAG-006） */
function mapJobRow(row: IngestJobRow): IngestJobRow {
  const raw: unknown = row.error;
  if (raw == null || typeof raw !== "string") return row;
  try {
    const parsed: unknown = JSON.parse(raw);
    row.error =
      parsed !== null && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
  } catch {
    row.error = null;
  }
  return row;
}

export async function createJob(input: {
  specialty: string;
  hcpId?: string;
  status?: IngestJobStatus;
}): Promise<IngestJobRow> {
  const jobId = randomUUID();
  const pool = getPool();
  const status = input.status ?? "pending";
  await pool.query(
    `INSERT INTO rag_ingest_jobs (job_id, specialty, hcp_id, status, progress, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [
      jobId,
      input.specialty,
      input.hcpId ?? null,
      status,
      status === "ready" ? 1 : 0,
    ],
  );
  const [rows] = await pool.query<IngestJobRow[]>(
    `SELECT * FROM rag_ingest_jobs WHERE job_id = ?`,
    [jobId],
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`rag_ingest_jobs 写入后回读失败: job_id=${jobId}`);
  }
  return mapJobRow(row);
}

export async function getJobById(jobId: string): Promise<IngestJobRow | null> {
  const pool = getPool();
  const [rows] = await pool.query<IngestJobRow[]>(
    `SELECT * FROM rag_ingest_jobs WHERE job_id = ?`,
    [jobId],
  );
  const row = rows[0];
  return row ? mapJobRow(row) : null;
}

export async function getLatestJobBySpecialty(
  specialty: string,
): Promise<IngestJobRow | null> {
  const pool = getPool();
  const [rows] = await pool.query<IngestJobRow[]>(
    `SELECT * FROM rag_ingest_jobs
     WHERE specialty = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    [specialty],
  );
  const row = rows[0];
  return row ? mapJobRow(row) : null;
}

export async function findInProgressJob(
  specialty: string,
): Promise<IngestJobRow | null> {
  const pool = getPool();
  const [rows] = await pool.query<IngestJobRow[]>(
    `SELECT * FROM rag_ingest_jobs
     WHERE specialty = ? AND status IN (${IN_PROGRESS.map(() => "?").join(", ")})
     ORDER BY updated_at DESC
     LIMIT 1`,
    [specialty, ...IN_PROGRESS],
  );
  const row = rows[0];
  return row ? mapJobRow(row) : null;
}

export async function updateJob(
  jobId: string,
  patch: {
    status?: IngestJobStatus;
    progress?: number;
    error?: Record<string, unknown> | null;
  },
): Promise<IngestJobRow | null> {
  const pool = getPool();
  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  if (patch.status !== undefined) {
    sets.push("status = ?");
    vals.push(patch.status);
  }
  if (patch.progress !== undefined) {
    sets.push("progress = ?");
    vals.push(patch.progress);
  }
  if (patch.error !== undefined) {
    sets.push("error = ?");
    vals.push(patch.error ? JSON.stringify(patch.error) : null);
  }
  vals.push(jobId);
  await pool.query(
    `UPDATE rag_ingest_jobs SET ${sets.join(", ")} WHERE job_id = ?`,
    vals,
  );
  const [rows] = await pool.query<IngestJobRow[]>(
    `SELECT * FROM rag_ingest_jobs WHERE job_id = ?`,
    [jobId],
  );
  const row = rows[0];
  return row ? mapJobRow(row) : null;
}
