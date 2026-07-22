import { resolve } from "node:path";
import { ragError } from "./types.js";

export function getDataDir(): string {
  return resolve(process.env.HCA_DATA_DIR ?? "./data");
}

/** F-RAG-002c: default only qdrant-local; cloud SaaS requires ADR + explicit env. */
export function assertVectorBackendLocal(): void {
  const backend = (process.env.VECTOR_BACKEND ?? "qdrant-local").toLowerCase();
  if (backend !== "qdrant-local") {
    throw ragError(
      "VALIDATION_ERROR",
      `VECTOR_BACKEND=${backend} 非默认；公有云向量须 ADR 并显式配置`,
      {
        repair_hint: "设 VECTOR_BACKEND=qdrant-local，或完成 ADR 后再改后端",
      },
    );
  }
}

export function getCorpusRoot(): string {
  return resolve(getDataDir(), "rag/corpus");
}

export function getComplianceCorpusRoot(): string {
  return resolve(getCorpusRoot(), "compliance");
}

export function getAcademicCorpusRoot(): string {
  return resolve(getCorpusRoot(), "academic");
}

export function getQdrantUrl(): string {
  return process.env.QDRANT_URL ?? "http://127.0.0.1:6333";
}

export function getEmbeddingModelId(): string {
  return (
    process.env.EMBEDDING_MODEL ??
    "Xenova/bge-small-zh-v1.5"
  );
}

export function getRerankModelId(): string {
  return process.env.RERANK_MODEL ?? "Xenova/bge-reranker-base";
}

export function getDenseWeight(): number {
  const v = Number(process.env.RAG_DENSE_WEIGHT ?? "0.7");
  return Number.isFinite(v) ? v : 0.7;
}

export function getSparseWeight(): number {
  const v = Number(process.env.RAG_SPARSE_WEIGHT ?? "0.3");
  return Number.isFinite(v) ? v : 0.3;
}
