/** True when value looks like a Latin Given Family name (e.g. Changxi Wang). */
export function isLatinNameEn(value: string | null | undefined): boolean {
  const s = value?.trim();
  if (!s) return false;
  if (/[\u4e00-\u9fff]/.test(s)) return false;
  return /[A-Za-z]/.test(s);
}

/** Display-only English name; hide duplicates and non-Latin garbage. */
export function displayNameEn(
  nameZh: string,
  nameEn?: string | null,
): string | undefined {
  const en = nameEn?.trim();
  if (!en || !isLatinNameEn(en)) return undefined;
  if (en === nameZh.trim()) return undefined;
  return en;
}
