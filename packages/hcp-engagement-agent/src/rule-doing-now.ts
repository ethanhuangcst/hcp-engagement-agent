import type { DoingNow, HcpInsights, VirtualTwin } from "@hca/domain";
import type { AgentLocale } from "./types.js";

/**
 * 无 LLM / Key 时的可审计一句话洞察（MVP-2 验收路径）。
 * 仅拼装 Twin + Insights 已有字段，不编造疗效/处方。
 */
export function ruleSynthesizeDoingNow(
  twin: VirtualTwin,
  insights: HcpInsights,
  locale: AgentLocale = "zh-CN",
): DoingNow {
  const asOf = new Date().toISOString().slice(0, 10);
  const themes = (twin.research?.themes ?? []).map(String);
  const pubs =
    (twin.research?.recent_pubs as
      | Array<{ title?: string; year?: number | null }>
      | undefined) ?? [];
  const topPub = pubs[0]?.title?.trim();
  const primary =
    themes[0] ?? twin.profile.specialties?.[0] ?? twin.profile.department;
  const name =
    locale === "en" && twin.profile.name_en?.trim()
      ? twin.profile.name_en.trim()
      : twin.profile.name_zh;

  const interests = (insights.interest_directions ?? []) as Array<{
    title?: string;
    analysis?: string;
  }>;
  const interestHint = interests[0]?.analysis || interests[0]?.title;

  let summary: string;
  if (locale === "en") {
    if (topPub && primary) {
      summary = `Public research trajectory centers on “${primary}”; recent publication cue: ${topPub.slice(0, 80)}`;
    } else if (primary) {
      summary = `Public profile suggests primary research/specialty focus around “${primary}” (rule-based; refine with LLM if available)`;
    } else if (insights.doing_now?.summary?.trim()) {
      summary = insights.doing_now.summary.trim();
    } else {
      summary = `${name} | ${twin.profile.hospital} ${twin.profile.department}: public evidence is sparse; bind literature IDs and rebuild intelligence`;
    }
  } else if (topPub && primary) {
    summary = `公开科研轨迹可见近期主题围绕「${primary}」，代表作线索：${topPub.slice(0, 80)}`;
  } else if (primary) {
    summary = `公开画像显示主要科研/专科方向偏向「${primary}」（规则合成，可再经 LLM 精炼）`;
  } else if (insights.doing_now?.summary?.trim()) {
    summary = insights.doing_now.summary.trim();
  } else {
    summary = `${twin.profile.name_zh}｜${twin.profile.hospital} ${twin.profile.department}：公开证据仍稀疏，建议补文献号后重建情报`;
  }

  const analysisParts =
    locale === "en"
      ? [
          interestHint
            ? `Interest axis: ${String(interestHint).slice(0, 120)}`
            : null,
          twin.profile.tags?.hcp_tier
            ? `Primary tier ${twin.profile.tags.hcp_tier}; keep engagement issue-tracked, avoid promo stacking`
            : null,
          "Do not assume Rx preference, hospital access intent, or private contacts",
        ].filter(Boolean)
      : [
          interestHint
            ? `兴趣轴：${String(interestHint).slice(0, 120)}`
            : null,
          twin.profile.tags?.hcp_tier
            ? `级别主标 ${twin.profile.tags.hcp_tier}；互动须按议题分轨，勿叠促销话术`
            : null,
          "不假设处方偏好、进院意愿或私人联系方式",
        ].filter(Boolean);

  return {
    summary,
    analysis: analysisParts.length
      ? `${analysisParts.join(locale === "en" ? ". " : "。")}${locale === "en" ? "." : "。"}`
      : undefined,
    evidence_refs: [
      themes.length ? "research.themes" : null,
      topPub ? "research.recent_pubs" : null,
      interests.length ? "interest_directions" : null,
      "profile.tags",
    ].filter((x): x is string => Boolean(x)),
    as_of: asOf,
    locale,
    confidence: themes.length || topPub ? "medium" : "low",
  };
}
