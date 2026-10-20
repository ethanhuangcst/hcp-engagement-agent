import { beforeEach, describe, expect, it, vi } from "vitest";

/** DEF-002 / US-RAG-006：元数据层 SQL 必须是 MySQL 方言（ADR-005 运行时） */
vi.mock("@hca/db", () => ({ getPool: vi.fn() }));

import { getPool } from "@hca/db";
import {
  createJob,
  findInProgressJob,
  getJobById,
  getLatestJobBySpecialty,
  updateJob,
  type IngestJobRow,
} from "./jobs.js";
import { upsertManifest } from "./api.js";
import { upsertAcademicManifest } from "./academic.js";

const query = vi.fn();

function mockPool() {
  query.mockReset();
  vi.mocked(getPool).mockReturnValue({ query } as never);
}

function jobRow(overrides: Record<string, unknown> = {}): IngestJobRow {
  return {
    job_id: "job-1",
    specialty: "cardiology",
    hcp_id: null,
    status: "pending",
    progress: 0,
    error: null,
    created_at: new Date("2026-10-20T00:00:00Z"),
    updated_at: new Date("2026-10-20T00:00:00Z"),
    ...overrides,
  } as IngestJobRow;
}

/** SELECT 类查询返回给定行集 */
function rowsResult(rows: unknown[]) {
  return [rows];
}

/** 断言 SQL 不含 Postgres 方言痕迹 */
function expectMysqlDialect(sql: string) {
  expect(sql).not.toMatch(/\$\d/);
  expect(sql).not.toContain("::");
  expect(sql).not.toContain("ON CONFLICT");
  expect(sql).not.toContain("RETURNING");
  expect(sql).not.toContain("ANY(");
}

/** 占位符数量与参数数量一致 */
function expectPlaceholdersMatch(sql: string, params: unknown[]) {
  const count = (sql.match(/\?/g) ?? []).length;
  expect(count).toBe(params.length);
}

beforeEach(mockPool);

describe("jobs.ts MySQL 方言", () => {
  it("should_write_with_mysql_placeholders_and_read_back_by_job_id_when_create_job", async () => {
    const base = jobRow();
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.trimStart().startsWith("INSERT")) return [[]];
      return [[{ ...base, job_id: params[0] }]];
    });
    const result = await createJob({ specialty: "cardiology" });

    expect(query).toHaveBeenCalledTimes(2);
    const [insertSql, insertParams] = query.mock.calls[0]!;
    expect(insertSql).toContain("INSERT INTO rag_ingest_jobs");
    expectMysqlDialect(insertSql);
    expectPlaceholdersMatch(insertSql, insertParams);
    const jobId = insertParams[0] as string;
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);

    const [selectSql, selectParams] = query.mock.calls[1]!;
    expect(selectSql).toMatch(/SELECT \* FROM rag_ingest_jobs WHERE job_id = \?/);
    expect(selectParams).toEqual([jobId]);
    expect(result.job_id).toBe(jobId);
  });

  it("should_return_row_when_get_job_by_id_selects_with_placeholder", async () => {
    const row = jobRow();
    query.mockResolvedValueOnce(rowsResult([row]));
    const result = await getJobById("job-1");

    const [sql, params] = query.mock.calls[0]!;
    expectMysqlDialect(sql);
    expect(sql).toMatch(/WHERE job_id = \?/);
    expect(params).toEqual(["job-1"]);
    expect(result?.job_id).toBe("job-1");
  });

  it("should_return_null_when_get_job_by_id_finds_no_row", async () => {
    query.mockResolvedValueOnce(rowsResult([]));
    await expect(getJobById("missing")).resolves.toBeNull();
  });

  it("should_use_in_placeholders_when_find_in_progress_job_filters_status", async () => {
    const row = jobRow({ status: "running" });
    query.mockResolvedValueOnce(rowsResult([row]));
    const result = await findInProgressJob("cardiology");

    const [sql, params] = query.mock.calls[0]!;
    expectMysqlDialect(sql);
    expect(sql).toContain("IN (?, ?)");
    expectPlaceholdersMatch(sql, params);
    expect(params).toEqual(["cardiology", "pending", "running"]);
    expect(result?.status).toBe("running");
  });

  it("should_update_then_read_back_when_update_job_patches_status_and_error", async () => {
    const row = jobRow({
      status: "failed",
      progress: 1,
      error: { code: "INGEST_FAILED" },
    });
    query
      .mockResolvedValueOnce(rowsResult([]))
      .mockResolvedValueOnce(rowsResult([row]));

    const result = await updateJob("job-1", {
      status: "failed",
      progress: 1,
      error: { code: "INGEST_FAILED", message: "boom" },
    });

    expect(query).toHaveBeenCalledTimes(2);
    const [updateSql, updateParams] = query.mock.calls[0]!;
    expectMysqlDialect(updateSql);
    expect(updateSql).toMatch(/UPDATE rag_ingest_jobs SET .* WHERE job_id = \?/);
    expectPlaceholdersMatch(updateSql, updateParams);
    expect(updateParams).toContain("failed");
    expect(updateParams).toContain(JSON.stringify({ code: "INGEST_FAILED", message: "boom" }));
    expect(updateParams[updateParams.length - 1]).toBe("job-1");

    const [selectSql] = query.mock.calls[1]!;
    expect(selectSql).toMatch(/SELECT \* FROM rag_ingest_jobs WHERE job_id = \?/);
    expect(result?.error).toEqual({ code: "INGEST_FAILED" });
  });

  it("should_write_null_when_update_job_clears_error", async () => {
    const row = jobRow({ status: "failed", error: null });
    query
      .mockResolvedValueOnce(rowsResult([]))
      .mockResolvedValueOnce(rowsResult([row]));
    await updateJob("job-1", { error: null });

    const [updateSql, updateParams] = query.mock.calls[0]!;
    expectPlaceholdersMatch(updateSql, updateParams);
    expect(updateParams).toContain(null);
    expect(updateParams).not.toContain("null");
  });

  it("should_parse_error_json_string_when_job_row_comes_from_mysql", async () => {
    const row = jobRow({ error: '{"code":"EMBED_FAILED"}' });
    query.mockResolvedValueOnce(rowsResult([row]));
    const result = await getJobById("job-1");
    expect(result?.error).toEqual({ code: "EMBED_FAILED" });
  });

  it("should_return_null_error_when_error_column_holds_invalid_json", async () => {
    const row = jobRow({ error: "not-json" });
    query.mockResolvedValueOnce(rowsResult([row]));
    const result = await getJobById("job-1");
    expect(result?.error).toBeNull();
  });

  it("should_return_latest_row_when_get_latest_job_by_specialty_selects", async () => {
    const row = jobRow({ status: "ready" });
    query.mockResolvedValueOnce(rowsResult([row]));
    const result = await getLatestJobBySpecialty("cardiology");

    const [sql, params] = query.mock.calls[0]!;
    expectMysqlDialect(sql);
    expectPlaceholdersMatch(sql, params);
    expect(params).toEqual(["cardiology"]);
    expect(result?.status).toBe("ready");
  });
});

describe("ingest_manifest upsert MySQL 方言", () => {
  it("should_use_on_duplicate_key_update_when_upsert_manifest_writes", async () => {
    query.mockResolvedValueOnce(rowsResult([]));
    await upsertManifest({
      doc_id: "doc-1",
      index_name: "hcp_compliance",
      version: "v1",
      as_of: "2026-10-20",
      corpus_path: "data/rag/corpus/compliance/doc-1/chunks.jsonl",
      chunk_count: 3,
    });

    const [sql, params] = query.mock.calls[0]!;
    expectMysqlDialect(sql);
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(sql).toContain("AS new");
    expect(sql).not.toContain("EXCLUDED");
    expectPlaceholdersMatch(sql, params);
    expect(params).toEqual([
      "doc-1",
      "hcp_compliance",
      "v1",
      "2026-10-20",
      "data/rag/corpus/compliance/doc-1/chunks.jsonl",
      3,
      null,
    ]);
  });

  it("should_use_on_duplicate_key_update_when_upsert_academic_manifest_writes", async () => {
    query.mockResolvedValueOnce(rowsResult([]));
    await upsertAcademicManifest({
      doc_id: "doc-2",
      specialty: "cardiology",
      version: "v1",
      as_of: "2026-10-20",
      corpus_path: "data/rag/corpus/academic/cardiology/chunks.jsonl",
      chunk_count: 5,
      authority: "pubmed",
    });

    const [sql, params] = query.mock.calls[0]!;
    expectMysqlDialect(sql);
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(sql).toContain("AS new");
    expect(sql).not.toContain("EXCLUDED");
    expectPlaceholdersMatch(sql, params);
    expect(params).toEqual([
      "doc-2",
      "academic_index",
      "cardiology",
      "v1",
      "2026-10-20",
      "data/rag/corpus/academic/cardiology/chunks.jsonl",
      5,
      "pubmed",
    ]);
  });
});
