/** 洞察 / 一人一策 → 数字分身详情的返回条文案（F-WEB-044） */
export function twinBackLabel(displayName: string): string {
  const name = displayName.trim() || "该 HCP";
  return `返回${name}数字分身`;
}
