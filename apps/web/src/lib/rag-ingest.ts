import {
  ingestOnDemand,
  normalizeSpecialty,
  tryNormalizeSpecialty,
} from "@hca/medical-kb";

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

export async function triggerKnowledgeIngest(input: {
  specialties?: string[];
  themes?: string[];
  department?: string;
  hcpId?: string;
  tags_draft?: { specialties?: string[]; role_tags?: string[] };
}): Promise<KnowledgeJobRef[]> {
  const keys = resolveSpecialtiesForIngest(input);
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
      }
    }
  }
  return jobs;
}
