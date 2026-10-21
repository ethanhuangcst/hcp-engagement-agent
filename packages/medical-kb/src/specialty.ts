import { ragError } from "./types.js";

/** Alias → controlled specialty key (F-RAG-014). */
const ALIAS_MAP: Record<string, string> = {
  kidney_transplant: "kidney_transplant",
  "kidney transplant": "kidney_transplant",
  "renal transplant": "kidney_transplant",
  "renal transplantation": "kidney_transplant",
  肾移植: "kidney_transplant",
  肾脏移植: "kidney_transplant",
  phage_therapy: "phage_therapy",
  "phage therapy": "phage_therapy",
  phage: "phage_therapy",
  噬菌体: "phage_therapy",
  噬菌体疗法: "phage_therapy",
  down_syndrome: "down_syndrome",
  "down syndrome": "down_syndrome",
  唐氏: "down_syndrome",
  唐氏综合征: "down_syndrome",
  遗传学: "down_syndrome",
  bk_virus: "kidney_transplant",
  "bk virus": "kidney_transplant",
  bkv: "kidney_transplant",
  /** feature-09（MKB2-02）：临床一级学科全集扩充 */
  neurology: "neurology",
  神经内科: "neurology",
  神经病学: "neurology",
  cardiology: "cardiology",
  心血管内科: "cardiology",
  心内科: "cardiology",
  respiratory_medicine: "respiratory_medicine",
  "respiratory medicine": "respiratory_medicine",
  呼吸内科: "respiratory_medicine",
  呼吸科: "respiratory_medicine",
  gastroenterology: "gastroenterology",
  消化内科: "gastroenterology",
  消化科: "gastroenterology",
  endocrinology: "endocrinology",
  内分泌科: "endocrinology",
  nephrology: "nephrology",
  肾内科: "nephrology",
  hematology: "hematology",
  血液科: "hematology",
  血液内科: "hematology",
  rheumatology: "rheumatology",
  风湿免疫科: "rheumatology",
  风湿科: "rheumatology",
  infectious_disease: "infectious_disease",
  "infectious disease": "infectious_disease",
  感染科: "infectious_disease",
  感染内科: "infectious_disease",
  general_surgery: "general_surgery",
  "general surgery": "general_surgery",
  普外科: "general_surgery",
  普通外科: "general_surgery",
  orthopedics: "orthopedics",
  骨科: "orthopedics",
  neurosurgery: "neurosurgery",
  神经外科: "neurosurgery",
  cardiothoracic_surgery: "cardiothoracic_surgery",
  "cardiothoracic surgery": "cardiothoracic_surgery",
  胸外科: "cardiothoracic_surgery",
  心胸外科: "cardiothoracic_surgery",
  urology: "urology",
  泌尿外科: "urology",
  obstetrics_gynecology: "obstetrics_gynecology",
  "obstetrics gynecology": "obstetrics_gynecology",
  妇产科: "obstetrics_gynecology",
  妇科: "obstetrics_gynecology",
  产科: "obstetrics_gynecology",
  pediatrics: "pediatrics",
  儿科: "pediatrics",
  oncology: "oncology",
  肿瘤科: "oncology",
  肿瘤内科: "oncology",
  psychiatry: "psychiatry",
  精神科: "psychiatry",
  精神卫生科: "psychiatry",
  dermatology: "dermatology",
  皮肤科: "dermatology",
  ophthalmology: "ophthalmology",
  眼科: "ophthalmology",
  otolaryngology: "otolaryngology",
  耳鼻喉科: "otolaryngology",
  耳鼻咽喉科: "otolaryngology",
  anesthesiology: "anesthesiology",
  麻醉科: "anesthesiology",
  emergency_medicine: "emergency_medicine",
  "emergency medicine": "emergency_medicine",
  急诊科: "emergency_medicine",
  急诊医学科: "emergency_medicine",
  radiology: "radiology",
  放射科: "radiology",
  影像科: "radiology",
  rehabilitation_medicine: "rehabilitation_medicine",
  "rehabilitation medicine": "rehabilitation_medicine",
  康复科: "rehabilitation_medicine",
  康复医学科: "rehabilitation_medicine",
};

const CONTROLLED_KEYS = new Set(Object.values(ALIAS_MAP));

/** feature-09：受控专科键全集（目录扩充后的权威清单，批量种子与测试共用） */
export const CONTROLLED_SPECIALTY_KEYS: readonly string[] = [
  ...new Set(
    Object.entries(ALIAS_MAP)
      .filter(([alias, key]) => alias === key)
      .map(([, key]) => key),
  ),
].sort();

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * feature-12（MCP2-10 / DEF-006，D2）：受控专科键 → 标准中文名。
 * 与 ALIAS_MAP 同源维护：新增受控专科时必须同时补 display 名，`specialtyDisplayName` 的单元测试兜底全覆盖。
 */
const SPECIALTY_DISPLAY: Record<string, string> = {
  kidney_transplant: "肾移植",
  phage_therapy: "噬菌体疗法",
  down_syndrome: "唐氏综合征",
  neurology: "神经内科",
  cardiology: "心血管内科",
  respiratory_medicine: "呼吸内科",
  gastroenterology: "消化内科",
  endocrinology: "内分泌科",
  nephrology: "肾内科",
  hematology: "血液科",
  rheumatology: "风湿免疫科",
  infectious_disease: "感染科",
  general_surgery: "普外科",
  orthopedics: "骨科",
  neurosurgery: "神经外科",
  cardiothoracic_surgery: "胸外科",
  urology: "泌尿外科",
  obstetrics_gynecology: "妇产科",
  pediatrics: "儿科",
  oncology: "肿瘤科",
  psychiatry: "精神科",
  dermatology: "皮肤科",
  ophthalmology: "眼科",
  otolaryngology: "耳鼻喉科",
  anesthesiology: "麻醉科",
  emergency_medicine: "急诊科",
  radiology: "放射科",
  rehabilitation_medicine: "康复科",
};

/**
 * feature-12（MCP2-10 / DEF-006，D2）：受控专科键 → 标准中文名反查。
 * 未知键返回 undefined，不猜测、不回退英文键原文（mcp2-test §15 单元行）。
 */
export function specialtyDisplayName(key: string): string | undefined {
  return SPECIALTY_DISPLAY[key.trim()];
}

export function normalizeSpecialty(raw: string): { specialty: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw ragError("SPECIALTY_UNRESOLVED", "专科为空，无法归一化", {
      repair_hint: "提供受控专科键或已知别名，如 kidney_transplant / 肾移植",
    });
  }
  const direct = ALIAS_MAP[trimmed] ?? ALIAS_MAP[normalizeKey(trimmed)];
  if (direct) return { specialty: direct };
  if (/^[a-z][a-z0-9_]*$/.test(trimmed) && CONTROLLED_KEYS.has(trimmed)) {
    return { specialty: trimmed };
  }
  throw ragError("SPECIALTY_UNRESOLVED", `无法归一化专科: ${trimmed}`, {
    repair_hint: "使用受控键 kidney_transplant / phage_therapy / down_syndrome 或中文别名",
    details: { raw: trimmed },
  });
}

export function tryNormalizeSpecialty(raw: string): string | null {
  try {
    return normalizeSpecialty(raw).specialty;
  } catch {
    return null;
  }
}

/**
 * feature-12 跟进（DEF-006 / MCP2-09，B+ 设计）：OpenAlex 概念名 → 受控专科键。
 * 仅收录可无歧义归入单一受控专科的领域概念；泛化词（Medicine、Internal medicine、
 * Immunology、Computer science 等）不入表，避免把宽泛主题误判成科室。
 * 新概念按 case 逐条核验后补入，配单元测试兜底。
 */
const OPENALEX_CONCEPT_SPECIALTY: Record<string, string> = {
  // 肾内科域（侯凡凡 case 经 OpenAlex 论文概念核验）
  nephrology: "nephrology",
  nephropathy: "nephrology",
  "kidney disease": "nephrology",
  "chronic renal failure": "nephrology",
  "end stage renal disease": "nephrology",
  "renal replacement therapy": "nephrology",
  hemodialysis: "nephrology",
  dialysis: "nephrology",
  "peritoneal dialysis": "nephrology",
};

/** feature-12 跟进：OpenAlex 概念名归一化为受控专科键；未收录概念返回 null。 */
export function openAlexConceptSpecialty(concept: string): string | null {
  return OPENALEX_CONCEPT_SPECIALTY[normalizeKey(concept)] ?? null;
}

/** 测试兜底用：概念表全量键值（值必须是受控专科键）。 */
export const OPENALEX_CONCEPT_SPECIALTY_KEYS: ReadonlyArray<
  readonly [concept: string, specialty: string]
> = Object.entries(OPENALEX_CONCEPT_SPECIALTY).map(([c, s]) => [c, s] as const);

export { CONTROLLED_KEYS };
