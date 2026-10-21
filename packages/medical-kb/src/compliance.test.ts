import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { complianceCoverage, findOutdatedComplianceVersions } from "./compliance-coverage.js";
import { retrieveCompliance, seedCompliance } from "./api.js";
import { COMPLIANCE_COLLECTION, ComplianceSeedChunkSchema, RagComplianceCoverageSchema } from "./types.js";

const { queryMock, qdrantMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  qdrantMock: {
    upsert: vi.fn(),
    delete: vi.fn(),
    search: vi.fn(),
    scroll: vi.fn(),
  },
}));

vi.mock("@hca/db", () => ({
  getPool: () => ({ query: queryMock }),
}));

vi.mock("./qdrant.js", () => ({
  ensureCollections: vi.fn(),
  getQdrantClient: () => qdrantMock,
  listCollectionNames: vi.fn(),
  pingQdrant: vi.fn(),
}));

vi.mock("./embedding.js", () => ({
  embedTexts: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
  embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
  embeddingDim: vi.fn(() => 3),
  rerank: vi.fn(async (_q: string, texts: string[]) => texts.map(() => 0.5)),
}));

type MockRows = Array<Record<string, unknown>>;

function mockQuery(selectRows: MockRows): void {
  queryMock.mockImplementation(async (sql: string) => {
    if (/SELECT/i.test(sql)) return [selectRows];
    return [[]];
  });
}

describe("complianceCoverage（F-RAG-030，mock manifest）", () => {
  it("should_aggregate_latest_version_row_per_authority_when_manifest_has_rows", async () => {
    mockQuery([
      { authority: "rdpac", version: "2024-01", chunk_count: 15, as_of: "2026-07-17", updated_at: "2026-10-21 10:00:00" },
      { authority: "rdpac", version: "2023-06", chunk_count: 6, as_of: "2025-12-01", updated_at: "2025-12-01 10:00:00" },
      { authority: "cn_med_rep_measures", version: "2026-08", chunk_count: 8, as_of: "2026-07-17", updated_at: "2026-10-21 10:00:00" },
    ]);

    const cov = await complianceCoverage();

    expect(cov.status).toBe("ready");
    expect(cov.authorities).toEqual([
      { authority: "cn_med_rep_measures", version: "2026-08", chunk_count: 8, as_of: "2026-07-17" },
      { authority: "rdpac", version: "2024-01", chunk_count: 15, as_of: "2026-07-17" },
    ]);
    expect(RagComplianceCoverageSchema.safeParse(cov).success).toBe(true);
  });

  it("should_return_sparse_when_manifest_has_no_authority_row", async () => {
    mockQuery([]);

    const cov = await complianceCoverage();

    expect(cov.status).toBe("sparse");
    expect(cov.authorities).toEqual([]);
  });

  it("should_pick_row_with_newer_updated_at_when_as_of_ties", async () => {
    mockQuery([
      { authority: "rdpac", version: "2024-01", chunk_count: 6, as_of: "2026-07-17", updated_at: "2026-10-01 10:00:00" },
      { authority: "rdpac", version: "2024-01b", chunk_count: 15, as_of: "2026-07-17", updated_at: "2026-10-21 10:00:00" },
    ]);

    const cov = await complianceCoverage();

    expect(cov.authorities[0]?.version).toBe("2024-01b");
    expect(cov.authorities[0]?.chunk_count).toBe(15);
  });
});

describe("findOutdatedComplianceVersions（F-RAG-031，mock manifest）", () => {
  it("should_exclude_kept_versions_from_returned_manifest_versions", async () => {
    mockQuery([{ version: "2024-01" }, { version: "2026-01" }]);

    const outdated = await findOutdatedComplianceVersions("test_auth", new Set(["2026-01"]));

    expect(outdated).toEqual(["2024-01"]);
  });

  it("should_return_empty_when_manifest_only_has_kept_version", async () => {
    mockQuery([{ version: "2026-01" }]);

    const outdated = await findOutdatedComplianceVersions("test_auth", new Set(["2026-01"]));

    expect(outdated).toEqual([]);
  });
});

describe("seedCompliance 版本治理与校验（F-RAG-031 / 032，mock Qdrant）", () => {
  let dataDir: string;

  const chunk = (version: string) =>
    JSON.stringify({
      clause_id: `RD-TEST-${version}`,
      text: `测试条款 ${version}`,
      authority: "test_auth",
      version,
      effective_date: `${version.slice(0, 4)}-01-01`,
      jurisdiction: "CN",
      as_of: "2026-10-21",
    });

  function writeCorpus(name: string, body: string): string {
    const dir = join(dataDir, "rag/corpus/compliance/testid", name);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, "chunks.jsonl");
    writeFileSync(p, `${body}\n`);
    return p;
  }

  beforeAll(() => {
    dataDir = mkdtempSync(join(tmpdir(), "mkb2-03-"));
    process.env.HCA_DATA_DIR = dataDir;
    qdrantMock.upsert.mockReset();
    qdrantMock.delete.mockReset();
    qdrantMock.upsert.mockResolvedValue(undefined);
    qdrantMock.delete.mockResolvedValue(undefined);
  });

  beforeEach(() => {
    qdrantMock.upsert.mockClear();
    qdrantMock.delete.mockClear();
    queryMock.mockReset();
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.HCA_DATA_DIR;
  });

  it("should_delete_old_version_points_by_authority_and_version_when_seeding_new_version", async () => {
    mockQuery([{ version: "2024-01" }, { version: "2026-01" }]);

    const file = writeCorpus("2026-01", chunk("2026-01"));

    const result = await seedCompliance({ paths: [file] });

    expect(result.upserted).toBe(1);
    expect(qdrantMock.upsert).toHaveBeenCalledTimes(1);
    expect(qdrantMock.delete).toHaveBeenCalledTimes(1);
    expect(qdrantMock.delete).toHaveBeenCalledWith(COMPLIANCE_COLLECTION, {
      wait: true,
      filter: {
        must: [
          { key: "authority", match: { value: "test_auth" } },
          { key: "version", match: { value: "2024-01" } },
        ],
      },
    });
  });

  it("should_be_noop_delete_when_rerunning_same_version", async () => {
    mockQuery([{ version: "2026-01" }]);

    const file = writeCorpus("2026-01-rerun", chunk("2026-01"));

    await seedCompliance({ paths: [file] });

    expect(qdrantMock.delete).not.toHaveBeenCalled();
  });

  it("should_throw_INGEST_FAILED_and_log_when_old_version_delete_fails", async () => {
    mockQuery([{ version: "2024-01" }]);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    qdrantMock.delete.mockRejectedValueOnce(new Error("qdrant down"));

    const file = writeCorpus("2026-01", chunk("2026-01"));

    await expect(seedCompliance({ paths: [file] })).rejects.toMatchObject({
      code: "INGEST_FAILED",
      details: { authority: "test_auth", version: "2024-01" },
    });
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("compliance_version_offline_failed"));
    errSpy.mockRestore();
    qdrantMock.delete.mockReset();
    qdrantMock.delete.mockResolvedValue(undefined);
  });

  it("should_report_line_number_when_row_missing_clause_id", async () => {
    const ok = JSON.stringify({
      clause_id: "RD-OK",
      text: "ok",
      authority: "test_auth",
      version: "2026-01",
      as_of: "2026-10-21",
    });
    const bad = JSON.stringify({ text: "缺 clause_id", authority: "test_auth", version: "2026-01", as_of: "2026-10-21" });

    const file = writeCorpus("bad", `${ok}\n${bad}`);

    await expect(seedCompliance({ paths: [file] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("第 2 行"),
    });
  });
});

describe("retrieveCompliance coverage 挂载（F-RAG-030，mock 检索面）", () => {
  beforeEach(() => {
    queryMock.mockReset();
    qdrantMock.search.mockReset();
    qdrantMock.scroll.mockReset();
    qdrantMock.scroll.mockResolvedValue({ points: [], next_page_offset: undefined });
    qdrantMock.search.mockResolvedValue([]);
  });

  it("should_return_sparse_coverage_with_repair_hint_when_manifest_empty", async () => {
    mockQuery([]);
    queryMock.mockImplementation(async (sql: string) => {
      // 两次 SELECT：合规检索 corpus 无关；coverage 查 manifest（空行）
      void sql;
      return [[]];
    });

    const r = await retrieveCompliance({ query: "机构同意 科室会", top_k: 3 });

    expect(r.chunks).toEqual([]);
    expect(r.coverage?.status).toBe("sparse");
    expect(r.repair_hint).toContain("seed_compliance");
  });

  it("should_return_ready_coverage_without_repair_hint_when_manifest_has_authorities", async () => {
    mockQuery([
      { authority: "rdpac", version: "2024-01", chunk_count: 15, as_of: "2026-07-17", updated_at: "2026-10-21 10:00:00" },
    ]);

    const r = await retrieveCompliance({ query: "机构同意 科室会", top_k: 3 });

    expect(r.coverage?.status).toBe("ready");
    expect(r.coverage?.authorities[0]?.authority).toBe("rdpac");
    expect(r.repair_hint).toBeUndefined();
  });

  it("should_omit_coverage_and_not_throw_when_manifest_read_fails", async () => {
    queryMock.mockImplementation(async () => {
      throw new Error("manifest down");
    });

    const r = await retrieveCompliance({ query: "机构同意 科室会", top_k: 3 });

    expect(Array.isArray(r.chunks)).toBe(true);
    expect(r.coverage).toBeUndefined();
    expect(r.repair_hint).toBeUndefined();
  });
});

describe("合规种子数据面（F-RAG-032，fixture 策展扩充）", () => {
  it("should_meet_minimum_counts_and_pass_zod_row_by_row", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/compliance");

    for (const [dir, min] of [
      ["rdpac/2024-01", 15],
      ["cn_med_rep/2026-08", 8],
    ] as const) {
      const body = readFileSync(join(root, dir, "chunks.jsonl"), "utf8");
      const lines = body.split("\n").filter((l) => l.trim());
      expect(lines.length, `${dir} 至少 ${min} 条`).toBeGreaterThanOrEqual(min);
      for (const line of lines) {
        const parsed = ComplianceSeedChunkSchema.safeParse(JSON.parse(line));
        expect(parsed.success, `${dir} 行 ${line.slice(0, 40)}… 应过 schema`).toBe(true);
        if (parsed.success) {
          expect(parsed.data.clause_id).toBeTruthy();
          expect(parsed.data.version).toBeTruthy();
          expect(parsed.data.tenant_id ?? null).toBeNull();
        }
      }
    }
  });
});