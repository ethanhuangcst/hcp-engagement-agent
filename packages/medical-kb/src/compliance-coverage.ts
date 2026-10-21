import { getPool } from "@hca/db";
import type { RowDataPacket } from "mysql2/promise";
import {
  COMPLIANCE_COLLECTION,
  type RagComplianceCoverage,
} from "./types.js";

interface ManifestRow extends RowDataPacket {
  authority: string;
  version: string;
  chunk_count: number;
  as_of: string | Date;
  updated_at: Date;
}

function asOfText(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value);
}

/** 同 authority 多版本共存时取「最新版本行」：as_of 最新，同日按 updated_at 最新（F-RAG-030） */
function isNewer(row: ManifestRow, prev: ManifestRow): boolean {
  const a = asOfText(row.as_of);
  const b = asOfText(prev.as_of);
  if (a !== b) return a > b;
  return new Date(row.updated_at).getTime() > new Date(prev.updated_at).getTime();
}

/** F-RAG-030（MKB2-03）：按 authority 聚合 ingest_manifest 最新版本行。
 *  status：ready=至少一个 authority 最新行 chunk_count > 0；sparse=无任何 authority 行（冷启动未灌种）。
 *  权威以 manifest 为准，不扫 Qdrant、不做词表门槛。 */
export async function complianceCoverage(): Promise<RagComplianceCoverage> {
  const pool = getPool();
  const [rows] = await pool.query<ManifestRow[]>(
    `SELECT authority, version, chunk_count, as_of, updated_at
     FROM ingest_manifest
     WHERE index_name = ? AND authority IS NOT NULL`,
    [COMPLIANCE_COLLECTION],
  );
  const latest = new Map<string, ManifestRow>();
  for (const row of rows) {
    const prev = latest.get(row.authority);
    if (!prev || isNewer(row, prev)) latest.set(row.authority, row);
  }
  const authorities = [...latest.entries()]
    .map(([authority, row]) => ({
      authority,
      version: String(row.version),
      chunk_count: Number(row.chunk_count),
      as_of: asOfText(row.as_of),
    }))
    .sort((a, b) => a.authority.localeCompare(b.authority));
  const ready = authorities.some((a) => a.chunk_count > 0);
  return { authorities, status: ready ? "ready" : "sparse" };
}

/** F-RAG-031（MKB2-03）：列出某 authority 在 manifest 中登记、且不在本次灌入版本集合内的旧版本，版本治理时按此删除旧条款。 */
export async function findOutdatedComplianceVersions(
  authority: string,
  keepVersions: ReadonlySet<string>,
): Promise<string[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT version
     FROM ingest_manifest
     WHERE index_name = ? AND authority = ?`,
    [COMPLIANCE_COLLECTION, authority],
  );
  const seen = new Set<string>();
  for (const row of rows) {
    const version = String(row.version);
    if (!keepVersions.has(version)) seen.add(version);
  }
  return [...seen];
}