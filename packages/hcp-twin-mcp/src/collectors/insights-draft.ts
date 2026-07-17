import type { HcpInsights, VirtualTwin } from "@hca/domain";

/** Stage E：基于已落库 Twin 片段写 Insights 草稿（非 LLM；Agent 可再 refine）. */
export function deriveInsightsDraft(
  twin: VirtualTwin,
  activity?: { events?: Array<{ name: string; date?: string | null }> },
): HcpInsights {
  const asOf = twin.meta.as_of;
  const themes = (twin.research?.themes ?? []).slice(0, 5);
  const pubs = (twin.research?.recent_pubs as Array<{ title?: string; year?: number }> | undefined) ?? [];
  const interest_directions = themes.map((t) => ({
    title: typeof t === "string" ? t : String(t),
    confidence: "medium",
    analysis: "Derived from OpenAlex concepts / works (Stage E draft)",
  }));

  const opportunities = [
    {
      title: "学术会议 / 文献讨论切入",
      priority: pubs.length ? "high" : "medium",
      note: "基于公开论文与主题；不假设处方或进院意愿",
    },
  ];

  if ((activity?.events?.length ?? 0) > 0) {
    opportunities.push({
      title: "临床试验相关学术互动",
      priority: "medium",
      note: "来自 ClinicalTrials.gov 公开登记旁证",
    });
  }

  const topPub = pubs[0]?.title;
  const primaryTheme = themes[0] ?? "专科方向";
  const doing_now = {
    summary: topPub
      ? `公开科研轨迹可见近期主题围绕「${primaryTheme}」，代表作线索：${topPub.slice(0, 80)}`
      : themes[0]
        ? `公开画像显示主要科研主题偏向「${primaryTheme}」（Stage E 草稿，待 Agent 精炼）`
        : "公开证据仍稀疏；需补充文献号或医院主页后再构建",
    analysis: "Stage E rule draft from career/research/activity slices",
    as_of: asOf,
    confidence: (themes.length ? "medium" : "low") as "medium" | "low",
  };

  return {
    hcp_id: twin.meta.hcp_id,
    as_of: asOf,
    doing_now,
    interest_directions,
    opportunities,
    evidence: [
      {
        kind: "stage_e_draft",
        source_type: "derived",
        as_of: asOf,
      },
    ],
  };
}
