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
};

const CONTROLLED_KEYS = new Set(Object.values(ALIAS_MAP));

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
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
