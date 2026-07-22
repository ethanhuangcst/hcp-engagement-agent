export {
  retrieveCompliance,
  seedCompliance,
  health,
  ensureDualCollectionsWithProbe,
} from "./api.js";

export {
  retrieveAcademic,
  ingestOnDemand,
  getIngestStatus,
  coverageCheck,
  ensureAcademicCorpusFromFixtures,
} from "./academic.js";

export { normalizeSpecialty, tryNormalizeSpecialty } from "./specialty.js";

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
  type RagChunk,
  type RagError,
  type ComplianceSeedChunk,
  type AcademicSeedChunk,
} from "./types.js";

export { assertSafeQdrantUrl, isBindSafe } from "./security.js";
export { Bm25Index, rrfFuse } from "./hybrid.js";
