import { pipeline, env } from "@xenova/transformers";
import {
  getEmbeddingModelId,
  getRerankModelId,
} from "./config.js";
import { ragError } from "./types.js";

/** Prefer HF mirror in CN; override with HF_ENDPOINT / TRANSFORMERS_REMOTE_HOST. */
const remoteHost =
  process.env.TRANSFORMERS_REMOTE_HOST ??
  process.env.HF_ENDPOINT ??
  "https://hf-mirror.com";

env.allowLocalModels = true;
env.useBrowserCache = false;
env.remoteHost = `${remoteHost.replace(/\/$/, "")}/`;
env.remotePathTemplate = "{model}/resolve/{revision}/";

type FeatureExtractor = (
  text: string,
  opts?: { pooling?: string; normalize?: boolean },
) => Promise<{ data: Float32Array }>;

type Ranker = (
  pairs: [string, string][],
) => Promise<{ data: Float32Array } | Float32Array>;

let embedder: FeatureExtractor | null = null;
let reranker: Ranker | null = null;

async function openAiCompatibleEmbed(texts: string[]): Promise<number[][]> {
  const base = process.env.EMBEDDING_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("EMBEDDING_BASE_URL not set");
  }
  const model =
    process.env.EMBEDDING_MODEL ?? "text-embedding-v3";
  const key =
    process.env.EMBEDDING_API_KEY ??
    process.env.DASHSCOPE_API_KEY ??
    "";
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`embedding HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data?: Array<{ embedding: number[]; index: number }>;
  };
  const rows = body.data ?? [];
  return rows
    .sort((a, b) => a.index - b.index)
    .map((r) => r.embedding);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  try {
    if (process.env.EMBEDDING_BASE_URL) {
      return await openAiCompatibleEmbed(texts);
    }
    if (!embedder) {
      embedder = (await pipeline(
        "feature-extraction",
        getEmbeddingModelId(),
      )) as FeatureExtractor;
    }
    const out: number[][] = [];
    for (const text of texts) {
      const result = await embedder(text, {
        pooling: "mean",
        normalize: true,
      });
      out.push(Array.from(result.data));
    }
    return out;
  } catch (err) {
    throw ragError("EMBEDDING_UNAVAILABLE", "Embedding 模型不可用", {
      details: {
        message: err instanceof Error ? err.message : String(err),
        remoteHost: process.env.EMBEDDING_BASE_URL ? "api" : remoteHost,
      },
      repair_hint:
        "检查网络/HF 镜像（HF_ENDPOINT），或设 EMBEDDING_BASE_URL 指向内网 OpenAI 兼容 embedding",
    });
  }
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  if (!v) throw ragError("EMBEDDING_UNAVAILABLE", "空 embedding");
  return v;
}

export async function rerank(
  query: string,
  passages: string[],
): Promise<number[]> {
  if (passages.length === 0) return [];

  // Cosine fallback uses the same real dense embeddings (not random).
  const cosineFallback = async () => {
    const q = await embedQuery(query);
    const docs = await embedTexts(passages);
    return docs.map((d) => cosine(q, d));
  };

  if (process.env.EMBEDDING_BASE_URL || process.env.RERANK_DISABLE === "true") {
    return cosineFallback();
  }

  try {
    if (!reranker) {
      reranker = (await pipeline(
        "text-classification",
        getRerankModelId(),
      )) as unknown as Ranker;
    }
  } catch {
    return cosineFallback();
  }

  try {
    const scores: number[] = [];
    for (const p of passages) {
      const pairs: [string, string][] = [[query, p]];
      const raw = await reranker(pairs);
      const data =
        (raw as { data?: Float32Array }).data ?? (raw as Float32Array);
      const score =
        Array.isArray(data) || data instanceof Float32Array
          ? Number(data[0])
          : 0;
      scores.push(Number.isFinite(score) ? score : 0);
    }
    return scores;
  } catch {
    return cosineFallback();
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function embeddingDim(vector: number[]): number {
  return vector.length;
}
