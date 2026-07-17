import type { HcpInsights, VirtualTwin } from "@hca/domain";
import { getInsights, getTwin } from "@hca/db";
import { agentError } from "./types.js";

export type TwinInsightsBundle = {
  hcpId: string;
  twin: VirtualTwin;
  insights: HcpInsights;
};

/** I-AGT-006 Capability: get_twin_insights */
export async function getTwinInsights(hcpId: string): Promise<TwinInsightsBundle> {
  const twin = await getTwin(hcpId);
  if (!twin) {
    throw agentError("INSIGHTS_NOT_FOUND", "无 Twin", {
      repair_hint: "先完成分身确认保存",
      details: { hcpId },
    });
  }
  let insights = await getInsights(hcpId);
  if (!insights) {
    insights = {
      hcp_id: hcpId,
      as_of: twin.meta.as_of,
      interest_directions: (twin.research?.themes ?? []).map((t) => ({
        title: String(t),
        analysis: "从 research.themes 派生的兴趣轴草稿",
        confidence: "medium",
      })),
      opportunities: [
        {
          title: "学术文献 / 主题讨论切入",
          priority: "medium",
          note: "不假设处方或进院意愿",
        },
      ],
      evidence: [],
    };
  }
  return { hcpId, twin, insights };
}

export function slimInsightsForPrompt(bundle: TwinInsightsBundle): string {
  const { twin, insights } = bundle;
  const slim = {
    identity: {
      name_zh: twin.identity?.name_zh ?? twin.profile.name_zh,
      hospital: twin.identity?.hospital ?? twin.profile.hospital,
      department: twin.identity?.department ?? twin.profile.department,
      title: twin.identity?.title ?? twin.profile.title,
    },
    tags: twin.profile.tags
      ? {
          hcp_tier: twin.profile.tags.hcp_tier,
          role_tags: twin.profile.tags.role_tags,
        }
      : undefined,
    research_themes: (twin.research?.themes ?? []).slice(0, 8),
    doing_now: insights.doing_now
      ? {
          summary: insights.doing_now.summary,
          analysis: insights.doing_now.analysis,
        }
      : undefined,
    interest_directions: (insights.interest_directions ?? []).slice(0, 6),
    opportunities: (insights.opportunities ?? []).slice(0, 6),
  };
  return JSON.stringify(slim, null, 2);
}

export function truncateChunks(
  chunks: { id: string; text: string; source?: string; score?: number }[],
  maxChars = 2400,
): string {
  const parts: string[] = [];
  let used = 0;
  for (const c of chunks.slice(0, 6)) {
    const line = `[${c.id}] ${(c.text ?? "").slice(0, 400)}`;
    if (used + line.length > maxChars) break;
    parts.push(line);
    used += line.length;
  }
  return parts.join("\n---\n");
}
