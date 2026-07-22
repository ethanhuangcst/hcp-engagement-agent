import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ensureDualCollectionsWithProbe,
  health,
  retrieveCompliance,
  seedCompliance,
  ingestOnDemand,
  retrieveAcademic,
  getIngestStatus,
  coverageCheck,
} from "./index.js";
import { assertSafeQdrantUrl } from "./security.js";
import { rrfFuse, Bm25Index } from "./hybrid.js";

function loadEnv(): void {
  const root = resolve(process.cwd(), "../..");
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  process.chdir(root);
}

loadEnv();

describe("security bind", () => {
  it("allows localhost and rejects public host without allow", () => {
    expect(assertSafeQdrantUrl("http://127.0.0.1:6333").ok).toBe(true);
    expect(assertSafeQdrantUrl("http://8.8.8.8:6333").ok).toBe(false);
  });
});

describe("hybrid helpers", () => {
  it("BM25 and RRF rank real tokens", () => {
    const idx = new Bm25Index();
    idx.rebuild([
      { id: "a", text: "院内学术会议须取得医疗机构同意" },
      { id: "b", text: "讲者费用应符合公平市场价值" },
    ]);
    const hits = idx.search("院内学术会议");
    expect(hits[0]?.id).toBe("a");
    const fused = rrfFuse(
      [
        [
          { id: "a", score: 1 },
          { id: "b", score: 0.5 },
        ],
        [
          { id: "b", score: 1 },
          { id: "a", score: 0.2 },
        ],
      ],
      [0.7, 0.3],
    );
    expect(fused.length).toBe(2);
  });
});

describe("MVP-4 medical-kb against live Qdrant + real embeddings", () => {
  beforeAll(async () => {
    const h = await health();
    if (!h.qdrant) {
      throw new Error(
        "Qdrant 未就绪：请先启动本地 Qdrant (http://127.0.0.1:6333)。禁止用 mock。",
      );
    }
    await ensureDualCollectionsWithProbe();
    await seedCompliance({});
  }, 300_000);

  it("health reports bind_safe and dual collections", async () => {
    const h = await health();
    expect(h.bind_safe).toBe(true);
    expect(h.qdrant).toBe(true);
    expect(h.collections).toEqual(
      expect.arrayContaining(["academic_index", "compliance_index"]),
    );
  });

  it("retrieve_compliance hits clause_id for hospital meeting query", async () => {
    const { chunks } = await retrieveCompliance({
      query: "院内学术会议需要哪些前置条件？",
      jurisdiction: "CN",
      top_k: 5,
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.index === "compliance")).toBe(true);
    expect(chunks.some((c) => c.clause_id && c.version)).toBe(true);
  });

  it("retrieve_compliance hits speaker FMV query", async () => {
    const { chunks } = await retrieveCompliance({
      query: "讲者费用应遵循什么原则？",
      top_k: 5,
    });
    expect(chunks.some((c) => c.clause_id?.includes("RDPAC-5") || c.text.includes("公平市场"))).toBe(
      true,
    );
  });

  it("retrieve_compliance hits medical rep备案 query", async () => {
    const { chunks } = await retrieveCompliance({
      query: "医药代表备案与禁止统方有哪些要点？",
      top_k: 5,
    });
    expect(chunks.some((c) => c.clause_id?.startsWith("CN-MR"))).toBe(true);
  });

  it("validation error on empty query", async () => {
    await expect(retrieveCompliance({ query: "" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("tenant isolation: shared clauses only without tenant_id", async () => {
    const { getQdrantClient } = await import("./qdrant.js");
    const { embedTexts, embeddingDim } = await import("./embedding.js");
    const { COMPLIANCE_COLLECTION } = await import("./types.js");
    const [vec] = await embedTexts([
      "租户专属SOP：仅限 tenant-demo 内部使用的讲者费用上限流程。",
    ]);
    const q = getQdrantClient();
    await q.upsert(COMPLIANCE_COLLECTION, {
      wait: true,
      points: [
        {
          id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          vector: vec!,
          payload: {
            text: "租户专属SOP：仅限 tenant-demo 内部使用的讲者费用上限流程。",
            source: "tenant-sop",
            version: "2026-01",
            as_of: "2026-07-17",
            index: "compliance",
            clause_id: "TENANT-DEMO-1",
            jurisdiction: "CN",
            tenant_id: "tenant-demo",
            authority: "tenant-demo",
          },
        },
      ],
    });
    void embeddingDim(vec!);

    const open = await retrieveCompliance({
      query: "租户专属SOP讲者费用上限",
      top_k: 5,
    });
    expect(open.chunks.every((c) => c.tenant_id == null)).toBe(true);
    expect(open.chunks.some((c) => c.clause_id === "TENANT-DEMO-1")).toBe(false);

    const scoped = await retrieveCompliance({
      query: "租户专属SOP讲者费用上限",
      tenant_id: "tenant-demo",
      top_k: 5,
    });
    expect(scoped.chunks.some((c) => c.clause_id === "TENANT-DEMO-1")).toBe(
      true,
    );
  });

  it("compliance chunks never report academic index", async () => {
    const { chunks } = await retrieveCompliance({
      query: "注册说明书一致",
      top_k: 3,
    });
    expect(chunks.every((c) => c.index === "compliance")).toBe(true);
  });
});

describe("MVP-3 academic ingest + retrieve (live Qdrant)", () => {
  let jobId: string;

  beforeAll(async () => {
    const h = await health();
    if (!h.qdrant) {
      throw new Error("Qdrant 未就绪");
    }
    await ensureDualCollectionsWithProbe();
  }, 300_000);

  it("ingest_on_demand kidney_transplant eventually ready or sparse", async () => {
    const started = await ingestOnDemand({
      specialty: "kidney_transplant",
      force: true,
    });
    jobId = started.jobId;
    expect(started.knowledge_status).toBe("pending");

    let finalStatus: "ready" | "sparse" | "pending" | "failed" =
      started.knowledge_status;
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const st = await getIngestStatus({ jobId });
      finalStatus = st.knowledge_status;
      if (finalStatus === "ready" || finalStatus === "sparse") break;
      if (finalStatus === "failed") break;
    }
    expect(["ready", "sparse"]).toContain(finalStatus);

    const cov = await coverageCheck("kidney_transplant");
    expect(cov.chunk_count).toBeGreaterThanOrEqual(1);
  }, 300_000);

  it("retrieve_academic with specialty filter hits academic chunks only", async () => {
    const { chunks } = await retrieveAcademic({
      query: "BK病毒 肾移植 监测",
      specialty: "kidney_transplant",
      top_k: 5,
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.index === "academic")).toBe(true);
    expect(chunks.every((c) => c.specialty === "kidney_transplant")).toBe(true);
    expect(chunks.every((c) => !c.clause_id)).toBe(true);
  });

  it("concurrent ingest without force returns INGEST_IN_PROGRESS or existing", async () => {
    await ingestOnDemand({ specialty: "phage_therapy", force: true });
    try {
      const first = await ingestOnDemand({ specialty: "phage_therapy" });
      expect(["ready", "pending"]).toContain(first.knowledge_status);
    } catch (err) {
      expect(err).toMatchObject({ code: "INGEST_IN_PROGRESS" });
    }
  }, 120_000);

  it("SPECIALTY_UNRESOLVED for garbage specialty", async () => {
    await expect(
      ingestOnDemand({ specialty: "完全无效的专科标签" }),
    ).rejects.toMatchObject({ code: "SPECIALTY_UNRESOLVED" });
  });
});
