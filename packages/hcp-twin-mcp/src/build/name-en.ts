import { pinyin } from "pinyin-pro";

/** True when value looks like a Latin Given Family name (e.g. Changxi Wang). */
export function isLatinNameEn(value: string | null | undefined): boolean {
  const s = value?.trim();
  if (!s) return false;
  if (/[\u4e00-\u9fff]/.test(s)) return false;
  return /[A-Za-z]/.test(s);
}

/**
 * Existing name_en only counts if Latin. CJK copies of name_zh are treated as empty
 * so Stage A / translate can backfill from OpenAlex.
 */
export function effectiveNameEn(
  value: string | null | undefined,
): string | undefined {
  const s = value?.trim();
  if (!s || !isLatinNameEn(s)) return undefined;
  return s;
}

function capitalizeToken(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Heuristic: single-character surname + given name → Given Family (literature style).
 * 王长希 → Changxi Wang；葛均波 → Junbo Ge.
 */
export function chineseToGivenFamily(nameZh: string): string | undefined {
  const chars = [...nameZh.trim()].filter((c) => /[\u4e00-\u9fff]/.test(c));
  if (chars.length < 2) return undefined;
  const surnamePy = pinyin(chars[0]!, { toneType: "none", type: "array" })[0];
  const givenPy = chars
    .slice(1)
    .map((c) => pinyin(c, { toneType: "none", type: "array" })[0] ?? "")
    .join("");
  if (!surnamePy || !givenPy) return undefined;
  return `${capitalizeToken(givenPy)} ${capitalizeToken(surnamePy)}`;
}

/**
 * Prefer existing Latin name_en; else Latin OpenAlex display_name.
 * Never keep CJK as name_en.
 */
export function backfillNameEn(
  existing: string | null | undefined,
  openAlexDisplay: string | null | undefined,
): string | undefined {
  return (
    effectiveNameEn(existing) ?? effectiveNameEn(openAlexDisplay) ?? undefined
  );
}
