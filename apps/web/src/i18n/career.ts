import type { Locale } from "./types";

/** English → zh-CN phrase map for common titles/roles/orgs. */
const EN_TO_ZH: ReadonlyArray<[RegExp, string]> = [
  [/\bProfessor\b/gi, "教授"],
  [/\bAssociate Professor\b/gi, "副教授"],
  [/\bAssistant Professor\b/gi, "助理教授"],
  [/\bChief Physician\b/gi, "主任医师"],
  [/\bAssociate Chief Physician\b/gi, "副主任医师"],
  [/\bAttending Physician\b/gi, "主治医师"],
  [/\bResident Physician\b/gi, "住院医师"],
  [/\bDirector\b/gi, "主任"],
  [/\bDeputy Director\b/gi, "副主任"],
  [/\bDean\b/gi, "院长"],
  [/\bVice Dean\b/gi, "副院长"],
  [/\bHead of Department\b/gi, "科主任"],
  [/\bDepartment Head\b/gi, "科主任"],
  [/\bChair(?:man|person)?\b/gi, "主任委员"],
  [/\bMember\b/gi, "委员"],
  [/\bFellow\b/gi, "研究员"],
  [/\bSurgeon\b/gi, "外科医师"],
  [/\bPhysician\b/gi, "医师"],
  [/\bHospital\b/gi, "医院"],
  [/\bUniversity\b/gi, "大学"],
  [/\bMedical School\b/gi, "医学院"],
  [/\bInstitute\b/gi, "研究所"],
];

/** zh-CN → English phrase map (partial; untranslated fragments stay as-is). */
const ZH_TO_EN: ReadonlyArray<[RegExp, string]> = [
  [/教授/g, "Professor"],
  [/副教授/g, "Associate Professor"],
  [/助理教授/g, "Assistant Professor"],
  [/主任医师/g, "Chief Physician"],
  [/副主任医师/g, "Associate Chief Physician"],
  [/主治医师/g, "Attending Physician"],
  [/住院医师/g, "Resident Physician"],
  [/科主任/g, "Department Head"],
  [/主任委员/g, "Chair"],
  [/副主任/g, "Deputy Director"],
  [/主任/g, "Director"],
  [/副院长/g, "Vice Dean"],
  [/院长/g, "Dean"],
  [/委员/g, "Member"],
  [/研究员/g, "Fellow"],
  [/外科医师/g, "Surgeon"],
  [/医师/g, "Physician"],
  [/医院/g, "Hospital"],
  [/大学/g, "University"],
  [/医学院/g, "Medical School"],
  [/研究所/g, "Institute"],
];

const KIND_KEYS = {
  education: "career.kind.education",
  current: "career.kind.current",
  past: "career.kind.past",
  society: "career.kind.society",
} as const;

export type CareerKind = keyof typeof KIND_KEYS;

export function normalizeCareerKind(raw?: string): CareerKind | null {
  if (!raw) return null;
  const k = raw.toLowerCase();
  if (k === "education" || k === "edu") return "education";
  if (k === "current" || k === "positions_current") return "current";
  if (k === "past" || k === "positions_past") return "past";
  if (k === "society" || k === "society_roles") return "society";
  return null;
}

export function localizeCareerKind(
  kind: string | undefined,
  locale: Locale,
  t: (key: string) => string,
): string | null {
  const normalized = normalizeCareerKind(kind);
  if (!normalized) return kind?.trim() || null;
  return t(KIND_KEYS[normalized]);
}

function applyPhraseMap(
  text: string,
  pairs: ReadonlyArray<[RegExp, string]>,
): string {
  let out = text;
  for (const [pattern, replacement] of pairs) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function localizeCareerText(text: string, locale: Locale): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (locale === "zh-CN") {
    return applyPhraseMap(trimmed, EN_TO_ZH);
  }
  return applyPhraseMap(trimmed, ZH_TO_EN);
}
