import { tryNormalizeSpecialty } from "@hca/medical-kb/specialty";

export type KnowledgeJobRef = {
  specialty: string;
  jobId: string;
  knowledge_status: "ready" | "sparse" | "pending" | "failed";
};

/** Resolve controlled specialty keys for on-demand academic ingest (F-WEB-039). */
export function resolveSpecialtiesForIngest(input: {
  specialties?: string[];
  themes?: string[];
  department?: string;
  tags_draft?: { specialties?: string[]; role_tags?: string[] };
}): string[] {
  const raw: string[] = [];
  if (input.specialties?.length) raw.push(...input.specialties);
  if (input.tags_draft?.specialties?.length) {
    raw.push(...input.tags_draft.specialties);
  }
  if (input.themes?.length) raw.push(...input.themes);
  if (input.tags_draft?.role_tags?.length) {
    raw.push(...input.tags_draft.role_tags);
  }
  const dept = input.department ?? "";
  if (/肾移植|肾脏移植|移植/.test(dept)) raw.push("kidney_transplant");
  if (/噬菌体/.test(dept)) raw.push("phage_therapy");
  if (/遗传|唐氏/.test(dept)) raw.push("down_syndrome");

  const out = new Set<string>();
  for (const item of raw) {
    const key = tryNormalizeSpecialty(item);
    if (key) out.add(key);
  }
  return [...out];
}

/**
 * Fire academic ingest. Dynamically imports @hca/medical-kb so Twin confirm
 * does not load @xenova/transformers / onnxruntime in the web image.
 */
export async function triggerKnowledgeIngest(input: {
  specialties?: string[];
  themes?: string[];
  department?: string;
  hcpId?: string;
  tags_draft?: { specialties?: string[]; role_tags?: string[] };
}): Promise<KnowledgeJobRef[]> {
  const keys = resolveSpecialtiesForIngest(input);
  if (keys.length === 0) return [];

  let normalizeSpecialty: (raw: string) => { specialty: string };
  let ingestOnDemand: (raw: unknown) => Promise<{
    jobId: string;
    knowledge_status: "ready" | "sparse" | "pending";
  }>;
  try {
    const kb = await import("@hca/medical-kb");
    normalizeSpecialty = kb.normalizeSpecialty;
    ingestOnDemand = kb.ingestOnDemand;
  } catch (err) {
    // Docker slim web image may lack onnxruntime — Twin save must still succeed.
    console.warn(
      "[rag-ingest] medical-kb unavailable; skip knowledge ingest:",
      err instanceof Error ? err.message : err,
    );
    return keys.map((specialty) => ({
      specialty,
      jobId: "",
      knowledge_status: "failed" as const,
    }));
  }

  const jobs: KnowledgeJobRef[] = [];
  for (const specialty of keys) {
    try {
      normalizeSpecialty(specialty);
      const result = await ingestOnDemand({
        specialty,
        themes: input.themes,
        hcpId: input.hcpId,
      });
      jobs.push({
        specialty,
        jobId: result.jobId,
        knowledge_status: result.knowledge_status,
      });
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "INTERNAL_ERROR";
      if (code === "INGEST_IN_PROGRESS") {
        jobs.push({
          specialty,
          jobId:
            typeof err === "object" &&
            err !== null &&
            "details" in err &&
            typeof (err as { details?: { jobId?: string } }).details?.jobId ===
              "string"
              ? (err as { details: { jobId: string } }).details.jobId
              : "",
          knowledge_status: "pending",
        });
      } else {
        console.warn("[rag-ingest] ingest failed for", specialty, err);
        jobs.push({
          specialty,
          jobId: "",
          knowledge_status: "failed",
        });
      }
    }
  }
  return jobs;
}
