import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "@hca/db";
import {
  bm25Search,
  ensureBm25ForCollection,
  invalidateBm25Cache,
} from "./bm25-cache.js";
import {
  assertVectorBackendLocal,
  getAcademicCorpusRoot,
  getCorpusRoot,
  getDenseWeight,
  getSparseWeight,
} from "./config.js";
import { embedQuery, embedTexts, embeddingDim, rerank } from "./embedding.js";
import { rrfFuse } from "./hybrid.js";
import {
  createJob,
  findInProgressJob,
  getJobById,
  getLatestJobBySpecialty,
  updateJob,
} from "./jobs.js";
import { ensureCollections, getQdrantClient } from "./qdrant.js";
import { normalizeSpecialty } from "./specialty.js";
import {
  ACADEMIC_COLLECTION,
  AcademicSeedChunkSchema,
  type AcademicSeedChunk,
  type RagChunk,
  GetIngestStatusInputSchema,
  IngestOnDemandInputSchema,
  ragError,
  RetrieveAcademicInputSchema,
} from "./types.js";

const READY_THRESHOLD = 3;
const SPARSE_THRESHOLD = 1;

function packageAcademicFixturesRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/academic");
}

function specialtyCorpusDir(specialty: string): string {
  return join(getAcademicCorpusRoot(), specialty);
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

function loadAcademicChunksJsonl(filePath: string): AcademicSeedChunk[] {
  const abs = assertUnderCorpus(filePath);
  const lines = readFileSync(abs, "utf8").split("\n").filter((l) => l.trim());
  return lines.map((line, i) => {
    const parsed = AcademicSeedChunkSchema.safeParse(JSON.parse(line));
    if (!parsed.success) {
      throw ragError("VALIDATION_ERROR", `academic chunks.jsonl 第 ${i + 1} 行无效`, {
        details: { issues: parsed.error.issues },
      });
    }
    return parsed.data;
  });
}

function countCorpusFileChunks(specialty: string): number {
  const file = join(specialtyCorpusDir(specialty), "chunks.jsonl");
  if (!existsSync(file)) return 0;
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim()).length;
}

export function ensureAcademicCorpusFromFixtures(specialty: string): string {
  const dataDir = specialtyCorpusDir(specialty);
  mkdirSync(dataDir, { recursive: true });
  const target = join(dataDir, "chunks.jsonl");
  if (existsSync(target) && countCorpusFileChunks(specialty) > 0) {
    return target;
  }
  const fixture = join(packageAcademicFixturesRoot(), specialty, "chunks.jsonl");
  if (!existsSync(fixture)) {
    throw ragError("CORPUS_PATH_INVALID", `无 ${specialty} 学术 fixtures`, {
      repair_hint: `添加 packages/medical-kb/fixtures/academic/${specialty}/chunks.jsonl`,
    });
  }
  copyFileSync(fixture, target);
  return target;
}

async function countQdrantSpecialtyChunks(specialty: string): Promise<number> {
  try {
    const q = getQdrantClient();
    const res = await q.count(ACADEMIC_COLLECTION, {
      exact: true,
      filter: { must: [{ key: "specialty", match: { value: specialty } }] },
    });
    return res.count;
  } catch {
    return 0;
  }
}

function statusFromCount(count: number): "ready" | "sparse" | "pending" {
  if (count >= READY_THRESHOLD) return "ready";
  if (count >= SPARSE_THRESHOLD) return "sparse";
  return "pending";
}

export async function coverageCheck(specialty: string): Promise<{
  status: "ready" | "sparse" | "pending";
  chunk_count: number;
}> {
  const normalized = normalizeSpecialty(specialty).specialty;
  let count = await countQdrantSpecialtyChunks(normalized);
  if (count === 0) {
    count = countCorpusFileChunks(normalized);
    if (count === 0) {
      const fixture = join(
        packageAcademicFixturesRoot(),
        normalized,
        "chunks.jsonl",
      );
      if (existsSync(fixture)) {
        count = readFileSync(fixture, "utf8")
          .split("\n")
          .filter((l) => l.trim()).length;
      }
    }
  }
  return { status: statusFromCount(count), chunk_count: count };
}

function academicPointId(chunk: AcademicSeedChunk, index: number): string {
  const key = chunk.pmid ?? chunk.doi ?? `${chunk.specialty}:${index}:${chunk.version}`;
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function upsertAcademicManifest(row: {
  doc_id: string;
  specialty: string;
  version: string;
  as_of: string;
  corpus_path: string;
  chunk_count: number;
  authority?: string;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO ingest_manifest (doc_id, index_name, specialty, version, as_of, corpus_path, chunk_count, authority, updated_at)
     VALUES (?,?,?,?,?,?,?,?,NOW(3))
     AS new
     ON DUPLICATE KEY UPDATE
       specialty = new.specialty,
       version = new.version,
       as_of = new.as_of,
       corpus_path = new.corpus_path,
       chunk_count = new.chunk_count,
       authority = new.authority,
       updated_at = NOW(3)`,
    [
      row.doc_id,
      ACADEMIC_COLLECTION,
      row.specialty,
      row.version,
      row.as_of,
      row.corpus_path,
      row.chunk_count,
      row.authority ?? null,
    ],
  );
}

async function fetchPubmedChunks(
  specialty: string,
  themes?: string[],
): Promise<AcademicSeedChunk[]> {
  const enabled =
    process.env.RAG_ACADEMIC_FETCH === "pubmed" || Boolean(process.env.NCBI_API_KEY);
  if (!enabled) return [];

  const terms = [
    specialty.replace(/_/g, " "),
    ...(themes ?? []).slice(0, 3),
  ].filter(Boolean);
  const query = encodeURIComponent(terms.join(" AND "));
  const key = process.env.NCBI_API_KEY
    ? `&api_key=${encodeURIComponent(process.env.NCBI_API_KEY)}`
    : "";

  try {
    const esearch = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${query}${key}`,
    );
    if (!esearch.ok) return [];
    const data = (await esearch.json()) as {
      esearchresult?: { idlist?: string[] };
    };
    const ids = data.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    const idParam = ids.join(",");
    const efetch = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=${idParam}${key}`,
    );
    if (!efetch.ok) return [];
    const xml = await efetch.text();
    const chunks: AcademicSeedChunk[] = [];
    const blocks = xml.split("<PubmedArticle>").slice(1);
    for (const block of blocks) {
      const pmid = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
      const title = block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1];
      const abstract = block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/)?.[1];
      const year = Number(block.match(/<Year>(\d{4})<\/Year>/)?.[1]);
      const text = [title, abstract]
        .map((s) => s?.replace(/<[^>]+>/g, "").trim())
        .filter(Boolean)
        .join(" ");
      if (!text) continue;
      chunks.push({
        text,
        specialty,
        as_of: new Date().toISOString().slice(0, 10),
        version: `pubmed-${pmid ?? "unknown"}`,
        pmid,
        source: "pubmed",
        year: Number.isFinite(year) ? year : undefined,
        language: "en",
        authority: "pubmed",
      });
    }
    return chunks;
  } catch {
    return [];
  }
}

async function upsertAcademicChunks(
  specialty: string,
  chunks: AcademicSeedChunk[],
  corpusPath: string,
): Promise<number> {
  if (chunks.length === 0) return 0;
  assertVectorBackendLocal();
  const vectors = await embedTexts(chunks.map((c) => c.text));
  const dim = embeddingDim(vectors[0] ?? []);
  if (!dim) throw ragError("EMBEDDING_UNAVAILABLE", "embedding 维度为空");

  await ensureCollections(dim);
  const q = getQdrantClient();
  const points = chunks.map((c, i) => ({
    id: academicPointId(c, i),
    vector: vectors[i]!,
    payload: {
      text: c.text,
      source: c.source,
      version: c.version,
      as_of: c.as_of,
      index: "academic",
      specialty: c.specialty,
      pmid: c.pmid ?? null,
      doi: c.doi ?? null,
      authority: c.authority ?? null,
      language: c.language ?? null,
      year: c.year ?? null,
      doc_type: "abstract",
    },
  }));

  const batchSize = 32;
  for (let i = 0; i < points.length; i += batchSize) {
    await q.upsert(ACADEMIC_COLLECTION, {
      wait: true,
      points: points.slice(i, i + batchSize),
    });
  }

  const sample = chunks[0]!;
  await upsertAcademicManifest({
    doc_id: `${specialty}:${sample.version}`,
    specialty,
    version: sample.version,
    as_of: sample.as_of,
    corpus_path: relative(getCorpusRoot(), corpusPath),
    chunk_count: chunks.length,
    authority: sample.authority,
  });

  invalidateBm25Cache(ACADEMIC_COLLECTION);
  return points.length;
}

async function runAcademicIngestJob(
  jobId: string,
  specialty: string,
  themes?: string[],
): Promise<void> {
  try {
    await updateJob(jobId, { status: "running", progress: 0.1 });
    const corpusPath = ensureAcademicCorpusFromFixtures(specialty);
    let chunks = loadAcademicChunksJsonl(corpusPath);

    const pubmed = await fetchPubmedChunks(specialty, themes);
    if (pubmed.length > 0) {
      const merged = [...chunks];
      const seen = new Set(chunks.map((c) => c.pmid ?? c.text.slice(0, 80)));
      for (const p of pubmed) {
        const key = p.pmid ?? p.text.slice(0, 80);
        if (!seen.has(key)) {
          merged.push(p);
          seen.add(key);
        }
      }
      writeFileSync(
        corpusPath,
        merged.map((c) => JSON.stringify(c)).join("\n") + "\n",
        "utf8",
      );
      chunks = merged;
    }

    await updateJob(jobId, { progress: 0.5 });
    await upsertAcademicChunks(specialty, chunks, corpusPath);

    const { status } = await coverageCheck(specialty);
    await updateJob(jobId, {
      status,
      progress: 1,
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const structured =
      typeof err === "object" && err !== null && "code" in err
        ? (err as Record<string, unknown>)
        : { code: "INGEST_FAILED", message };
    await updateJob(jobId, {
      status: "failed",
      progress: 1,
      error: structured,
    });
  }
}

export async function ingestOnDemand(raw: unknown): Promise<{
  jobId: string;
  knowledge_status: "ready" | "sparse" | "pending";
}> {
  const parsed = IngestOnDemandInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw ragError("VALIDATION_ERROR", "ingest_on_demand 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }

  const { specialty: rawSpecialty, themes, hcpId, force } = parsed.data;
  const { specialty } = normalizeSpecialty(rawSpecialty);

  const inProgress = await findInProgressJob(specialty);
  if (inProgress && !force) {
    throw ragError("INGEST_IN_PROGRESS", `专科 ${specialty} 已有进行中的 ingest`, {
      details: { jobId: inProgress.job_id },
      retryable: true,
    });
  }

  const coverage = await coverageCheck(specialty);
  if (coverage.status === "ready" && !force) {
    const latest = await getLatestJobBySpecialty(specialty);
    if (latest && (latest.status === "ready" || latest.status === "sparse")) {
      return { jobId: latest.job_id, knowledge_status: "ready" };
    }
    const cached = await createJob({
      specialty,
      hcpId,
      status: "ready",
    });
    return { jobId: cached.job_id, knowledge_status: "ready" };
  }

  const job = await createJob({ specialty, hcpId, status: "pending" });
  void runAcademicIngestJob(job.job_id, specialty, themes);
  return { jobId: job.job_id, knowledge_status: "pending" };
}

export async function getIngestStatus(raw: unknown): Promise<{
  jobId: string;
  specialty?: string;
  status: string;
  knowledge_status: "ready" | "sparse" | "pending" | "failed";
  progress?: number;
  error?: unknown;
  chunk_count?: number;
}> {
  const parsed = GetIngestStatusInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw ragError("VALIDATION_ERROR", "get_ingest_status 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }

  let job = parsed.data.jobId
    ? await getJobById(parsed.data.jobId)
    : null;
  if (!job && parsed.data.specialty) {
    const { specialty } = normalizeSpecialty(parsed.data.specialty);
    job = await getLatestJobBySpecialty(specialty);
    if (!job) {
      const coverage = await coverageCheck(specialty);
      return {
        jobId: "",
        specialty,
        status: coverage.status,
        knowledge_status: coverage.status,
        chunk_count: coverage.chunk_count,
      };
    }
  }
  if (!job) {
    throw ragError("VALIDATION_ERROR", "未找到 ingest job", {
      repair_hint: "提供有效 jobId 或 specialty",
    });
  }

  const specialty = job.specialty ?? undefined;
  const coverage = specialty ? await coverageCheck(specialty) : null;
  const knowledge_status =
    job.status === "failed"
      ? "failed"
      : job.status === "ready" || job.status === "sparse"
        ? job.status
        : coverage?.status ?? "pending";

  return {
    jobId: job.job_id,
    specialty,
    status: job.status,
    knowledge_status,
    progress: job.progress ?? undefined,
    error: job.error ?? undefined,
    chunk_count: coverage?.chunk_count,
  };
}

async function loadAcademicPayloadsForBm25(): Promise<
  Array<{ id: string; text: string; payload: Record<string, unknown> }>
> {
  const q = getQdrantClient();
  const rows: Array<{ id: string; text: string; payload: Record<string, unknown> }> =
    [];
  let offset: string | number | null | undefined = undefined;
  do {
    const page = await q.scroll(ACADEMIC_COLLECTION, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,
    });
    for (const p of page.points) {
      const payload = (p.payload ?? {}) as Record<string, unknown>;
      rows.push({
        id: String(p.id),
        text: String(payload.text ?? ""),
        payload,
      });
    }
    offset = page.next_page_offset as string | number | null | undefined;
  } while (offset != null);
  return rows;
}

export async function retrieveAcademic(
  raw: unknown,
): Promise<{ chunks: RagChunk[] }> {
  const parsed = RetrieveAcademicInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw ragError("VALIDATION_ERROR", "retrieve_academic 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }

  const { query, specialty: rawSpecialty, year_from, language, top_k = 5 } =
    parsed.data;
  assertVectorBackendLocal();

  const must: Array<Record<string, unknown>> = [];
  if (rawSpecialty) {
    const { specialty } = normalizeSpecialty(rawSpecialty);
    must.push({ key: "specialty", match: { value: specialty } });
  }
  if (language) {
    must.push({ key: "language", match: { value: language } });
  }
  if (year_from != null) {
    must.push({ key: "year", range: { gte: year_from } });
  }

  const qVec = await embedQuery(query);
  await ensureCollections(qVec.length);
  const q = getQdrantClient();

  const dense = await q.search(ACADEMIC_COLLECTION, {
    vector: qVec,
    limit: Math.max(top_k * 4, 20),
    with_payload: true,
    filter: must.length ? { must } : undefined,
  });

  const corpus = await ensureBm25ForCollection(
    ACADEMIC_COLLECTION,
    loadAcademicPayloadsForBm25,
  );
  const sparseHits = bm25Search(
    ACADEMIC_COLLECTION,
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
    .filter((row) => row.payload.index !== "compliance")
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
    source: String(c.payload.source ?? "academic"),
    version: String(c.payload.version ?? ""),
    as_of: String(c.payload.as_of ?? ""),
    index: "academic" as const,
    doc_type: c.payload.doc_type ? String(c.payload.doc_type) : undefined,
    specialty: c.payload.specialty ? String(c.payload.specialty) : undefined,
    pmid: c.payload.pmid ? String(c.payload.pmid) : undefined,
    doi: c.payload.doi ? String(c.payload.doi) : undefined,
    authority: c.payload.authority ? String(c.payload.authority) : undefined,
    language: c.payload.language ? String(c.payload.language) : undefined,
    year:
      typeof c.payload.year === "number"
        ? c.payload.year
        : c.payload.year != null
          ? Number(c.payload.year)
          : undefined,
  }));

  return { chunks };
}
