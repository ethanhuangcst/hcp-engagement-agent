import {
  retrieveAcademic,
  retrieveCompliance,
  RetrieveAcademicInputSchema,
  RetrieveComplianceInputSchema,
  ragError,
  type RagChunk,
} from "@hca/medical-kb";

export async function retrieveAcademicForAgent(
  raw: unknown,
): Promise<{ chunks: RagChunk[] }> {
  const parsed = RetrieveAcademicInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw ragError("VALIDATION_ERROR", "retrieve_academic 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }
  return retrieveAcademic(parsed.data);
}

export async function retrieveComplianceForAgent(
  raw: unknown,
): Promise<{ chunks: RagChunk[] }> {
  const parsed = RetrieveComplianceInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw ragError("VALIDATION_ERROR", "retrieve_compliance 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }
  return retrieveCompliance(parsed.data);
}
