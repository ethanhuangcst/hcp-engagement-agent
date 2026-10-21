import { ingestOnDemand } from "./academic.js";
import { normalizeSpecialty, tryNormalizeSpecialty } from "./specialty.js";

export type KnowledgeJobRef = {
  specialty: string;
  jobId: string;
  knowledge_status: "ready" | "sparse" | "pending" | "failed";
};

/**
 * feature-09（MKB2-02）：科室 → 受控键启发式，数据驱动、顺序敏感。
 * 顺序规则：具体科室先于泛化匹配（如 肾移植 先于 肾内科，神经外科 先于 神经内科）。
 */
export const DEPARTMENT_PATTERNS: readonly (readonly [
  RegExp,
  string,
])[] = [
  [/肾移植|肾脏移植|移植/, "kidney_transplant"],
  [/噬菌体/, "phage_therapy"],
  [/唐氏|遗传/, "down_syndrome"],
  [/神经外科/, "neurosurgery"],
  [/神经内科|神经病学|神经病|神经科|神内/, "neurology"],
  [/心血管内科|心内科|心脏病学/, "cardiology"],
  [/心外科|胸外科|心胸外科/, "cardiothoracic_surgery"],
  [/呼吸/, "respiratory_medicine"],
  [/消化/, "gastroenterology"],
  [/内分泌/, "endocrinology"],
  [/肾内科|肾脏内科|肾内/, "nephrology"],
  [/血液/, "hematology"],
  [/风湿/, "rheumatology"],
  [/感染/, "infectious_disease"],
  [/普外科|普通外科/, "general_surgery"],
  [/骨科/, "orthopedics"],
  [/泌尿外科/, "urology"],
  [/妇产科|妇科|产科/, "obstetrics_gynecology"],
  [/儿科|小儿科/, "pediatrics"],
  [/肿瘤/, "oncology"],
  [/精神/, "psychiatry"],
  [/皮肤/, "dermatology"],
  [/眼科/, "ophthalmology"],
  [/耳鼻喉|耳鼻咽喉/, "otolaryngology"],
  [/麻醉/, "anesthesiology"],
  [/急诊/, "emergency_medicine"],
  [/放射|影像/, "radiology"],
  [/康复/, "rehabilitation_medicine"],
];

/** MCP2-09（DEF-005）：单条归一化明细——matched 为 false 表示该输入映射不到受控专科（预灌将跳过）。 */
export type SpecialtyPreviewRow = {
  input: string;
  specialty: string | null;
  matched: boolean;
};

/** 逐输入归一化明细核心：resolveSpecialtiesForIngest 与 resolveSpecialtyPreview 同源共用，保证预览与实际预灌一致。 */
function resolveSpecialtyRows(input: {
  specialties?: string[];
  themes?: string[];
  department?: string;
  tags_draft?: { specialties?: string[]; role_tags?: string[] };
}): SpecialtyPreviewRow[] {
  const raw: string[] = [];
  if (input.specialties?.length) raw.push(...input.specialties);
  if (input.tags_draft?.specialties?.length) {
    raw.push(...input.tags_draft.specialties);
  }
  if (input.themes?.length) raw.push(...input.themes);
  if (input.tags_draft?.role_tags?.length) {
    raw.push(...input.tags_draft.role_tags);
  }

  const rows: SpecialtyPreviewRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = tryNormalizeSpecialty(item);
    const rowKey = `${item}\u0000${key ?? ""}`;
    if (seen.has(rowKey)) continue;
    seen.add(rowKey);
    rows.push({ input: item, specialty: key, matched: key !== null });
  }

  const dept = input.department ?? "";
  if (dept.trim().length > 0) {
    const deptKeys: string[] = [];
    for (const [pattern, key] of DEPARTMENT_PATTERNS) {
      if (pattern.test(dept)) deptKeys.push(key);
    }
    if (deptKeys.length > 0) {
      for (const key of deptKeys) {
        const rowKey = `${dept}\u0000${key}`;
        if (seen.has(rowKey)) continue;
        seen.add(rowKey);
        rows.push({ input: dept, specialty: key, matched: true });
      }
    } else {
      rows.push({ input: dept, specialty: null, matched: false });
    }
  }
  return rows;
}

/** Resolve controlled specialty keys for on-demand academic ingest (F-WEB-039 / ADR-014). */
export function resolveSpecialtiesForIngest(input: {
  specialties?: string[];
  themes?: string[];
  department?: string;
  tags_draft?: { specialties?: string[]; role_tags?: string[] };
}): string[] {
  const out = new Set<string>();
  for (const row of resolveSpecialtyRows(input)) {
    if (row.matched && row.specialty) out.add(row.specialty);
  }
  return [...out];
}

/** MCP2-09（DEF-005）：映射预览明细视图，与 resolveSpecialtiesForIngest 同一次核心结果（mcp2-design §13.3）。 */
export function resolveSpecialtyPreview(input: {
  specialties?: string[];
  themes?: string[];
  department?: string;
  tags_draft?: { specialties?: string[]; role_tags?: string[] };
}): SpecialtyPreviewRow[] {
  return resolveSpecialtyRows(input);
}

/** Fire-and-forget friendly on-demand ingest per controlled specialty (F-WEB-039 / ADR-014). */
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
