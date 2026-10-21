export {
  retrieveCompliance,
  seedCompliance,
  health,
  ensureDualCollectionsWithProbe,
} from "./api.js";

export {
  complianceCoverage,
  findOutdatedComplianceVersions,
} from "./compliance-coverage.js";

export {
  retrieveAcademic,
  ingestOnDemand,
  getIngestStatus,
  coverageCheck,
  ensureAcademicCorpusFromFixtures,
  academicPointId,
} from "./academic.js";

export {
  normalizeSpecialty,
  tryNormalizeSpecialty,
  specialtyDisplayName,
  openAlexConceptSpecialty,
  OPENALEX_CONCEPT_SPECIALTY_KEYS,
  CONTROLLED_SPECIALTY_KEYS,
  CONTROLLED_KEYS,
} from "./specialty.js";

export {
  RagChunkSchema,
  RagErrorSchema,
  ragError,
  ACADEMIC_COLLECTION,
  COMPLIANCE_COLLECTION,
  AcademicSeedChunkSchema,
  RetrieveAcademicInputSchema,
  IngestOnDemandInputSchema,
  GetIngestStatusInputSchema,
  RetrieveComplianceInputSchema,
  RagCoverageSchema,
  RagComplianceCoverageSchema,
  type RagChunk,
  type RagError,
  type RagCoverage,
  type RagComplianceCoverage,
  type ComplianceSeedChunk,
  type AcademicSeedChunk,
} from "./types.js";

export { assertSafeQdrantUrl, isBindSafe } from "./security.js";
export { Bm25Index, rrfFuse } from "./hybrid.js";
export {
  resolveSpecialtiesForIngest,
  resolveSpecialtyPreview,
  triggerKnowledgeIngest,
  DEPARTMENT_PATTERNS,
  type KnowledgeJobRef,
  type SpecialtyPreviewRow,
} from "./ingest-trigger.js";

export {
  seedAcademicBatch,
  summarizeSeedBatch,
  type SeedBatchDeps,
  type SeedBatchResultRow,
  type SeedAcademicBatchOptions,
} from "./seed-batch.js";
