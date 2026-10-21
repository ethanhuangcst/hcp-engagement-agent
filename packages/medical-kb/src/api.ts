import { readdirSync, readFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { getPool } from "@hca/db";
import {
  ComplianceSeedChunkSchema,
  ACADEMIC_COLLECTION,
  COMPLIANCE_COLLECTION,
  type ComplianceSeedChunk,
  type RagChunk,
  type RagComplianceCoverage,
  ragError,
  RetrieveComplianceInputSchema,
  SeedComplianceInputSchema,
} from "./types.js";
import {
  complianceCoverage,
  findOutdatedComplianceVersions,
} from "./compliance-coverage.js";
import {
  assertVectorBackendLocal,
  getComplianceCorpusRoot,
  getCorpusRoot,
  getDenseWeight,
  getSparseWeight,
  getQdrantUrl,
} from "./config.js";
import { embedQuery, embedTexts, embeddingDim, rerank } from "./embedding.js";
import { rrfFuse } from "./hybrid.js";
import {
  bm25Search,
  ensureBm25ForCollection,
  invalidateBm25Cache,
} from "./bm25-cache.js";
import {
  ensureCollections,
  getQdrantClient,
  listCollectionNames,
  pingQdrant,
} from "./qdrant.js";
import { assertSafeQdrantUrl } from "./security.js";

function packageFixturesRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/compliance");
}

export function ensureComplianceCorpusFromFixtures(): string[] {
  const dataRoot = getComplianceCorpusRoot();
  mkdirSync(dataRoot, { recursive: true });
  const existing = discoverChunkFiles(dataRoot);
  if (existing.length > 0) return existing;

  const fixtures = packageFixturesRoot();
  if (!existsSync(fixtures)) {
    throw ragError("CORPUS_PATH_INVALID", "无合规语料且无包内 fixtures", {
      repair_hint: "添加 packages/medical-kb/fixtures/compliance/**/chunks.jsonl",
    });
  }
  const copied: string[] = [];
  const walk = (dir: string, rel = "") => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const from = join(dir, name.name);
      const relPath = rel ? `${rel}/${name.name}` : name.name;
      const to = join(dataRoot, relPath);
      if (name.isDirectory()) {
        mkdirSync(to, { recursive: true });
        walk(from, relPath);
      } else if (name.name === "chunks.jsonl") {
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
        copied.push(to);
      }
    }
  };
  walk(fixtures);
  return copied;
}

function discoverChunkFiles(root: string): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.name === "chunks.jsonl") out.push(p);
    }
  };
  walk(root);
  return out;
}

function assertUnderCorpus(path: string): string {
  const root = resolve(getCorpusRoot());
  const abs = resolve(path);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || resolve(root, rel) !== abs) {
    throw ragError("CORPUS_PATH_INVALID", `路径逃出语料根: ${path}`, {
      repair_hint: `仅允许 ${root} 下文件`,
    });
  }
  return abs;
}

function loadChunksJsonl(filePath: string): ComplianceSeedChunk[] {
  const abs = assertUnderCorpus(filePath);
  const lines = readFileSync(abs, "utf8").split("\n").filter((l) => l.trim());
  return lines.map((line, i) => {
    const parsed = ComplianceSeedChunkSchema.safeParse(JSON.parse(line));
    if (!parsed.success) {
      throw ragError("VALIDATION_ERROR", `chunks.jsonl 第 ${i + 1} 行无效`, {
        details: { issues: parsed.error.issues },
      });
    }
    return parsed.data;
  });
}

function discoverComplianceChunkFiles(paths?: string[]): string[] {
  if (paths?.length) return paths.map((p) => assertUnderCorpus(p));
  ensureComplianceCorpusFromFixtures();
  return discoverChunkFiles(getComplianceCorpusRoot());
}

export async function upsertManifest(row: {
  doc_id: string;
  index_name: string;
  version: string;
  as_of: string;
  corpus_path: string;
  chunk_count: number;
  authority?: string;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO ingest_manifest (doc_id, index_name, version, as_of, corpus_path, chunk_count, authority, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     AS new ON DUPLICATE KEY UPDATE
       version = new.version,
       as_of = new.as_of,
       corpus_path = new.corpus_path,
       chunk_count = new.chunk_count,
       authority = new.authority,
       updated_at = NOW()`,
    [
      row.doc_id,
      row.index_name,
      row.version,
      row.as_of,
      row.corpus_path,
      row.chunk_count,
      row.authority ?? null,
    ],
  );
}

function pointId(clauseId: string, version: string): string {
  const h = createHash("sha256").update(`${clauseId}:${version}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export async function seedCompliance(raw: unknown = {}): Promise<{
  upserted: number;
  manifest_rev: string;
}> {
  const parsed = SeedComplianceInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw ragError("VALIDATION_ERROR", "seed_compliance 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }
  assertVectorBackendLocal();

  const files = discoverComplianceChunkFiles(parsed.data.paths);
  if (files.length === 0) {
    throw ragError("CORPUS_PATH_INVALID", "未找到 compliance chunks.jsonl", {
      repair_hint: "将条款 JSONL 放到 data/rag/corpus/compliance/**/chunks.jsonl",
    });
  }

  const allChunks: ComplianceSeedChunk[] = [];
  for (const f of files) allChunks.push(...loadChunksJsonl(f));

  const vectors = await embedTexts(allChunks.map((c) => c.text));
  const dim = embeddingDim(vectors[0] ?? []);
  if (!dim) throw ragError("EMBEDDING_UNAVAILABLE", "embedding 维度为空");

  await ensureCollections(dim);
  const q = getQdrantClient();

  const points = allChunks.map((c, i) => ({
    id: pointId(c.clause_id, c.version),
    vector: vectors[i]!,
    payload: {
      text: c.text,
      source: c.source ?? c.authority,
      source_url: c.source_url ?? null,
      version: c.version,
      as_of: c.as_of,
      index: "compliance",
      clause_id: c.clause_id,
      jurisdiction: c.jurisdiction,
      tenant_id: c.tenant_id ?? null,
      authority: c.authority,
      effective_date: c.effective_date ?? null,
    },
  }));

  const batchSize = 32;
  for (let i = 0; i < points.length; i += batchSize) {
    await q.upsert(COMPLIANCE_COLLECTION, {
      wait: true,
      points: points.slice(i, i + batchSize),
    });
  }

  /** F-RAG-031（MKB2-03）版本治理：同 authority 灌入新版本后，manifest 中登记的旧版本条款下线（删除 point）。
   *  重跑同版本时待删集合为空，等价 no-op；删除失败抛 INGEST_FAILED，不写半状态。 */
  const seededVersions = new Map<string, Set<string>>();
  for (const c of allChunks) {
    const set = seededVersions.get(c.authority) ?? new Set<string>();
    set.add(c.version);
    seededVersions.set(c.authority, set);
  }
  for (const [authority, versions] of seededVersions) {
    const outdated = await findOutdatedComplianceVersions(authority, versions);
    for (const oldVersion of outdated) {
      try {
        await q.delete(COMPLIANCE_COLLECTION, {
          wait: true,
          filter: {
            must: [
              { key: "authority", match: { value: authority } },
              { key: "version", match: { value: oldVersion } },
            ],
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({
            code: "INGEST_FAILED",
            event: "compliance_version_offline_failed",
            authority,
            version: oldVersion,
            message,
          }),
        );
        throw ragError(
          "INGEST_FAILED",
          `旧版本条款下线失败: ${authority}@${oldVersion}`,
          {
            repair_hint: "失败可重跑 seed_compliance（幂等），先检查 Qdrant 连通性",
            retryable: true,
            details: { authority, version: oldVersion },
          },
        );
      }
    }
  }

  const byDoc = new Map<string, ComplianceSeedChunk[]>();
  for (const c of allChunks) {
    const key = `${c.authority}:${c.version}`;
    const list = byDoc.get(key) ?? [];
    list.push(c);
    byDoc.set(key, list);
  }

  const rev = randomUUID();
  for (const [key, chunks] of byDoc) {
    const sample = chunks[0]!;
    const matchedFile =
      files.find((f) => f.includes(sample.authority)) ?? files[0]!;
    await upsertManifest({
      doc_id: key,
      index_name: COMPLIANCE_COLLECTION,
      version: sample.version,
      as_of: sample.as_of,
      corpus_path: relative(getCorpusRoot(), matchedFile),
      chunk_count: chunks.length,
      authority: sample.authority,
    });
  }

  invalidateBm25Cache(COMPLIANCE_COLLECTION);
  return { upserted: points.length, manifest_rev: rev };
}

export async function loadCompliancePayloadsForBm25(): Promise<
  Array<{ id: string; text: string; payload: Record<string, unknown> }>
> {
  const q = getQdrantClient();
  const rows: Array<{ id: string; text: string; payload: Record<string, unknown> }> =
    [];
  // F-RAG-034 / DEF-004：point-ID 游标 + seen 去重（offset 语义含头，会重返回游标点）
  const seen = new Set<string>();
  let offset: string | number | undefined = undefined;
  for (;;) {
    const page = await q.scroll(COMPLIANCE_COLLECTION, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,
    });
    const fresh = page.points.filter((p) => !seen.has(String(p.id)));
    for (const p of fresh) {
      seen.add(String(p.id));
      const payload = (p.payload ?? {}) as Record<string, unknown>;
      rows.push({
        id: String(p.id),
        text: String(payload.text ?? ""),
        payload,
      });
    }
    if (fresh.length === 0) break;
    offset = page.points[page.points.length - 1]!.id as string | number;
  }
  return rows;
}

async function ensureBm25(): Promise<
  Array<{ id: string; text: string; payload: Record<string, unknown> }>
> {
  return ensureBm25ForCollection(
    COMPLIANCE_COLLECTION,
    loadCompliancePayloadsForBm25,
  );
}

export async function retrieveCompliance(
  raw: unknown,
): Promise<{
  chunks: RagChunk[];
  coverage?: RagComplianceCoverage;
  repair_hint?: string;
}> {
  const parsed = RetrieveComplianceInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw ragError("VALIDATION_ERROR", "retrieve_compliance 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }

  const { query, jurisdiction, tenant_id, top_k = 5 } = parsed.data;
  assertVectorBackendLocal();
  const must: Array<Record<string, unknown>> = [];
  if (jurisdiction) {
    must.push({ key: "jurisdiction", match: { value: jurisdiction } });
  }

  const qVec = await embedQuery(query);
  await ensureCollections(qVec.length);
  const q = getQdrantClient();

  const dense = await q.search(COMPLIANCE_COLLECTION, {
    vector: qVec,
    limit: Math.max(top_k * 4, 20),
    with_payload: true,
    filter: must.length ? { must } : undefined,
  });

  const corpus = await ensureBm25();
  const sparseHits = bm25Search(
    COMPLIANCE_COLLECTION,
    query,
    Math.max(top_k * 4, 20),
  );

  const denseRanked = dense.map((d) => ({
    id: String(d.id),
    score: d.score ?? 0,
  }));
  const fused = rrfFuse(
    [denseRanked, sparseHits],
    [getDenseWeight(), getSparseWeight()],
  );

  const byId = new Map(corpus.map((r) => [r.id, r]));
  for (const d of dense) {
    if (!byId.has(String(d.id))) {
      byId.set(String(d.id), {
        id: String(d.id),
        text: String((d.payload as Record<string, unknown>)?.text ?? ""),
        payload: (d.payload ?? {}) as Record<string, unknown>,
      });
    }
  }

  const candidates = fused
    .map((f) => byId.get(f.id))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .filter((row) => {
      const tid = row.payload.tenant_id;
      if (tenant_id) return tid == null || tid === tenant_id;
      return tid == null;
    })
    .slice(0, Math.max(top_k * 3, 15));

  const scores = await rerank(
    query,
    candidates.map((c) => c.text),
  );
  const rescored = candidates
    .map((c, i) => ({ c, score: scores[i] ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, top_k);

  const chunks: RagChunk[] = rescored.map(({ c, score }) => ({
    id: c.id,
    text: c.text,
    score,
    source: String(c.payload.source ?? c.payload.authority ?? "compliance"),
    source_url: c.payload.source_url
      ? String(c.payload.source_url)
      : undefined,
    version: String(c.payload.version ?? ""),
    as_of: String(c.payload.as_of ?? ""),
    index: "compliance" as const,
    clause_id: c.payload.clause_id
      ? String(c.payload.clause_id)
      : undefined,
    jurisdiction: c.payload.jurisdiction
      ? String(c.payload.jurisdiction)
      : undefined,
    tenant_id: (c.payload.tenant_id as string | null | undefined) ?? null,
    authority: c.payload.authority ? String(c.payload.authority) : undefined,
  }));

  let coverage: RagComplianceCoverage | undefined;
  try {
    coverage = await complianceCoverage();
  } catch {
    /** manifest 读取失败：降级省略 coverage，检索照常返回 chunks */
    coverage = undefined;
  }

  return {
    chunks,
    /** F-RAG-030（MKB2-03）：coverage 只读旁路；manifest 读取失败降级省略，检索不报错（同 ADR-014 学术侧语义） */
    ...(coverage ? { coverage } : {}),
    ...(coverage?.status === "sparse"
      ? {
          repair_hint:
            "合规知识库尚未灌种（manifest 无 authority 行），建议运维执行 seed_compliance 灌种后重试",
        }
      : {}),
  };
}

export type HealthProbeResult = { ok: boolean; error?: unknown };

/** F-RAG-023 / DEF-004：带 filter 的 1 点探测读，复现实弹读路径（points/search）。坏 shard 只在这里 panic。 */
async function probeCollectionRead(
  collection: string,
  indexValue: string,
): Promise<HealthProbeResult> {
  try {
    const vector = await embedQuery("健康检查探针");
    const q = getQdrantClient();
    await q.search(collection, {
      vector,
      limit: 1,
      with_payload: false,
      with_vector: false,
      filter: { must: [{ key: "index", match: { value: indexValue } }] },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function health(): Promise<{
  ok: boolean;
  qdrant: boolean;
  collections: string[];
  bind_safe: boolean;
  embedding?: string;
  error?: unknown;
  probe?: { academic: HealthProbeResult; compliance: HealthProbeResult };
}> {
  const url = getQdrantUrl();
  const bindCheck = assertSafeQdrantUrl(url);
  const bind_safe = bindCheck.ok;
  if (!bind_safe) {
    return {
      ok: false,
      qdrant: false,
      collections: [],
      bind_safe: false,
      error: bindCheck.error,
    };
  }
  const qdrantOk = await pingQdrant();
  let collections: string[] = [];
  if (qdrantOk) {
    try {
      collections = await listCollectionNames();
    } catch {
      collections = [];
    }
  }
  const embedding = process.env.EMBEDDING_MODEL ?? "Xenova/bge-small-zh-v1.5";
  if (!qdrantOk) {
    return { ok: false, qdrant: false, collections, bind_safe, embedding };
  }
  const probe = {
    academic: await probeCollectionRead(ACADEMIC_COLLECTION, "academic"),
    compliance: await probeCollectionRead(COMPLIANCE_COLLECTION, "compliance"),
  };
  const probesOk = probe.academic.ok && probe.compliance.ok;
  return {
    ok: qdrantOk && bind_safe && probesOk,
    qdrant: qdrantOk,
    collections,
    bind_safe,
    embedding,
    probe,
    ...(probesOk ? {} : { error: "probe read failed" }),
  };
}

export async function ensureDualCollectionsWithProbe(): Promise<void> {
  const v = await embedQuery("健康检查探针");
  await ensureCollections(v.length);
}
