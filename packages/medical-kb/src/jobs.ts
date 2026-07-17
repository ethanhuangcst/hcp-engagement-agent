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
  const { rows } = await pool.query<IngestJobRow>(
    `INSERT INTO rag_ingest_jobs (job_id, specialty, hcp_id, status, progress, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [jobId, input.specialty, input.hcpId ?? null, status, status === "ready" ? 1 : 0],
  );
  return rows[0]!;
}

export async function getJobById(jobId: string): Promise<IngestJobRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<IngestJobRow>(
    `SELECT * FROM rag_ingest_jobs WHERE job_id = $1`,
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
     WHERE specialty = $1
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
  const { rows } = await pool.query<IngestJobRow>(
    `SELECT * FROM rag_ingest_jobs
     WHERE specialty = $1 AND status = ANY($2::text[])
     ORDER BY updated_at DESC
     LIMIT 1`,
    [specialty, IN_PROGRESS],
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
  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [jobId];
  let idx = 2;
  if (patch.status !== undefined) {
    sets.push(`status = $${idx++}`);
    vals.push(patch.status);
  }
  if (patch.progress !== undefined) {
    sets.push(`progress = $${idx++}`);
    vals.push(patch.progress);
  }
  if (patch.error !== undefined) {
    sets.push(`error = $${idx++}::jsonb`);
    vals.push(patch.error ? JSON.stringify(patch.error) : null);
  }
  const { rows } = await pool.query<IngestJobRow>(
    `UPDATE rag_ingest_jobs SET ${sets.join(", ")} WHERE job_id = $1 RETURNING *`,
    vals,
  );
  return rows[0] ?? null;
}
