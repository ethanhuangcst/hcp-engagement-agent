import { randomUUID } from "node:crypto";
import { getPool } from "@hca/db";

export type IngestJobStatus =
  | "pending"
  | "running"
  | "ready"
  | "sparse"
  | "failed";

export type IngestJobRow = {
  job_id: string;
  specialty: string | null;
  hcp_id: string | null;
  status: IngestJobStatus;
  progress: number | null;
  error: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

const IN_PROGRESS: IngestJobStatus[] = ["pending", "running"];

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
     VALUES (?, ?, ?, ?, ?, NOW(3))`,
    [jobId, input.specialty, input.hcpId ?? null, status, status === "ready" ? 1 : 0],
  );
  const row = await getJobById(jobId);
  if (!row) throw new Error(`createJob: row not found after insert (${jobId})`);
  return row;
}

export async function getJobById(jobId: string): Promise<IngestJobRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<IngestJobRow>(
    `SELECT * FROM rag_ingest_jobs WHERE job_id = ?`,
    [jobId],
  );
  return rows[0] ?? null;
}

export async function getLatestJobBySpecialty(
  specialty: string,
): Promise<IngestJobRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<IngestJobRow>(
    `SELECT * FROM rag_ingest_jobs
     WHERE specialty = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    [specialty],
  );
  return rows[0] ?? null;
}

export async function findInProgressJob(
  specialty: string,
): Promise<IngestJobRow | null> {
  const pool = getPool();
  const placeholders = IN_PROGRESS.map(() => "?").join(", ");
  const { rows } = await pool.query<IngestJobRow>(
    `SELECT * FROM rag_ingest_jobs
     WHERE specialty = ? AND status IN (${placeholders})
     ORDER BY updated_at DESC
     LIMIT 1`,
    [specialty, ...IN_PROGRESS],
  );
  return rows[0] ?? null;
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
  const sets: string[] = ["updated_at = NOW(3)"];
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
    sets.push("error = CAST(? AS JSON)");
    vals.push(patch.error ? JSON.stringify(patch.error) : null);
  }
  vals.push(jobId);
  await pool.query(
    `UPDATE rag_ingest_jobs SET ${sets.join(", ")} WHERE job_id = ?`,
    vals,
  );
  return getJobById(jobId);
}
