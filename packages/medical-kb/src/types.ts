import { z } from "zod";

export const RagErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "QDRANT_UNAVAILABLE",
  "UNSAFE_QDRANT_BIND",
  "CORPUS_PATH_INVALID",
  "TENANT_ISOLATION_VIOLATION",
  "EMBEDDING_UNAVAILABLE",
  "SPECIALTY_UNRESOLVED",
  "INGEST_IN_PROGRESS",
  "INGEST_FAILED",
  "COVERAGE_SPARSE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

export type RagErrorCode = z.infer<typeof RagErrorCodeSchema>;

export const RagErrorSchema = z.object({
  code: RagErrorCodeSchema,
  message: z.string(),
  repair_hint: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),
});

export type RagError = z.infer<typeof RagErrorSchema>;

export function ragError(
  code: RagErrorCode,
  message: string,
  opts?: {
    repair_hint?: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  },
): RagError {
  const retryableDefault =
    code === "QDRANT_UNAVAILABLE" ||
    code === "EMBEDDING_UNAVAILABLE" ||
    code === "INGEST_IN_PROGRESS" ||
    code === "RATE_LIMITED";
  return {
    code,
    message,
    repair_hint: opts?.repair_hint,
    details: opts?.details,
    retryable: opts?.retryable ?? retryableDefault,
  };
}

export const RagChunkSchema = z.object({
  id: z.string(),
  text: z.string(),
  score: z.number(),
  source: z.string(),
  source_url: z.string().optional(),
  version: z.string(),
  as_of: z.string(),
  index: z.enum(["academic", "compliance"]),
  doc_type: z.string().optional(),
  specialty: z.string().optional(),
  pmid: z.string().optional(),
  doi: z.string().optional(),
  authority: z.string().optional(),
  language: z.string().optional(),
  year: z.number().optional(),
  clause_id: z.string().optional(),
  jurisdiction: z.string().optional(),
  tenant_id: z.string().nullable().optional(),
});

export type RagChunk = z.infer<typeof RagChunkSchema>;

export const ComplianceSeedChunkSchema = z.object({
  clause_id: z.string().min(1),
  text: z.string().min(1),
  authority: z.string().min(1),
  version: z.string().min(1),
  effective_date: z.string().optional(),
  jurisdiction: z.string().default("CN"),
  as_of: z.string(),
  source: z.string().optional(),
  source_url: z.string().optional(),
  tenant_id: z.string().nullable().optional(),
});

export type ComplianceSeedChunk = z.infer<typeof ComplianceSeedChunkSchema>;

export const RetrieveComplianceInputSchema = z.object({
  query: z.string().min(1),
  jurisdiction: z.string().optional(),
  tenant_id: z.string().optional(),
  interaction_type: z.string().optional(),
  top_k: z.number().int().positive().max(20).optional(),
});

export const SeedComplianceInputSchema = z.object({
  corpus_id: z.string().optional(),
  paths: z.array(z.string()).optional(),
});

export const ACADEMIC_COLLECTION = "academic_index";
export const COMPLIANCE_COLLECTION = "compliance_index";
