import type {
  EngagementOption,
  EngagementRef,
  HcpInsights,
  VirtualTwin,
} from "@hca/domain";
import type { RagChunk } from "@hca/medical-kb";

function refsFromChunks(
  chunks: RagChunk[],
  kind: "academic" | "compliance",
): EngagementRef[] {
  return chunks.slice(0, 3).map((c) => ({
    id: c.clause_id || c.pmid || c.doi || c.id,
    label:
      kind === "compliance"
        ? `${c.authority ?? c.source}:${c.clause_id ?? c.id}`
        : `${c.source}${c.pmid ? ` PMID:${c.pmid}` : ""}`,
    source: c.source,
    score: c.score,
  }));
}

function ownerForTier(twin: VirtualTwin): string {
  const tier = twin.profile.tags?.hcp_tier;
  if (tier === "T1") return "MSL（医学科学联络）主导，代表协同";
  if (tier === "T2") return "代表主导，MSL 按需支持";
  return "代表主导";
}

function oppTitles(insights: HcpInsights): string[] {
  const opps = insights.opportunities ?? [];
  const titles: string[] = [];
  for (const o of opps) {
    if (o && typeof o === "object" && "title" in o) {
      const t = String((o as { title: unknown }).title ?? "").trim();
      if (t) titles.push(t);
    }
  }
  return titles;
}

/** 无 LLM 时的可审计规则提案（3–4 条） */
export function ruleProposeOptions(
  twin: VirtualTwin,
  insights: HcpInsights,
  academic: RagChunk[],
  compliance: RagChunk[],
): EngagementOption[] {
  const name = twin.identity?.name_zh ?? twin.profile.name_zh;
  const themes = (twin.research?.themes ?? []).map(String);
  const theme =
    themes[0] ||
    oppTitles(insights)[0] ||
    "公开学术主题交流";
  const owner = ownerForTier(twin);
  const academic_refs = refsFromChunks(academic, "academic");
  const compliance_refs = refsFromChunks(compliance, "compliance");
  const compliance_note =
    compliance_refs.length > 0
      ? "须机构同意与代表备案；仅限说明书与已审核学术材料范围；不替代 MLR"
      : "合规库命中有限：须人工合规确认后再外发；不得挂钩销售任务或促销话术";

  const base: Omit<
    EngagementOption,
    "id" | "label" | "action" | "channel" | "priority"
  > = {
    owner,
    theme: `围绕「${theme}」的公开证据讨论（面向 ${name}）`,
    success_signal: "HCP 确认收到材料或约定下一次学术交流时间（不绑定处方）",
    compliance_note,
    academic_refs,
    compliance_refs,
  };

  const options: EngagementOption[] = [
    {
      ...base,
      id: "o1",
      label: "方案 1",
      action: "MSL 科学交流（文献要点）",
      channel: "线下/腾讯会议 · 医学事务",
      priority: "P0",
    },
    {
      ...base,
      id: "o2",
      label: "方案 2",
      action: "企微学术摘要推送",
      channel: "企业微信",
      priority: "P1",
      theme: `推送已审核的「${theme}」摘要，避免促销话术`,
      compliance_note: `${compliance_note}；企微内容须 MLR 版本`,
    },
    {
      ...base,
      id: "o3",
      label: "方案 3",
      action: "科室会选题建议（程序前置）",
      channel: "院内学术推广（须机构同意）",
      priority: "P1",
      theme: `科室会主题草案：${theme}；议程不含销售任务`,
      compliance_note:
        "院内会须医疗卫生机构同意 + 已备案代表；讲者费须 FMV；不替代 MLR",
    },
  ];

  const secondOpp = oppTitles(insights)[1] || themes[1];
  if (secondOpp) {
    options.push({
      ...base,
      id: "o4",
      label: "方案 4",
      action: "代表访前文献对齐",
      channel: "拜访前简报",
      priority: "P2",
      theme: `对齐机会「${secondOpp}」与公开文献要点`,
      success_signal: "访前材料已与医学事务口径一致，并记录问题清单",
    });
  }

  return options.slice(0, 5);
}
