import {
  DoingNowSchema,
  type DoingNow,
  type HcpInsights,
  type VirtualTwin,
} from "@hca/domain";
import { getInsights, getTwin, upsertInsights } from "@hca/db";
import { isLlmStrict } from "./config.js";
import { createLlmClient, type LlmClient } from "./llm.js";
import { ruleSynthesizeDoingNow } from "./rule-doing-now.js";
import {
  agentError,
  SynthesizeDoingNowInputSchema,
  type AgentError,
} from "./types.js";

const SYSTEM = `你是中国市场药企 HCP Engagement 助手。根据给定的公开分身与洞察骨架，写一句话洞察（doing_now）。
要求：
1. summary 为 1–3 句中文，可审计，只基于给定事实；不编造疗效、处方、进院、私人联系方式。
2. analysis 可选，简短访前解读；推断须可追溯到给定字段。
3. evidence_refs 用短路径如 research.themes、opportunities、interest_directions。
4. 禁止处方潜力、统方、销量话术。
5. 只输出一个 JSON 对象，不要 Markdown：{"summary":"...","analysis":"...","evidence_refs":["..."],"confidence":"high|medium|low"}`;

function buildContext(twin: VirtualTwin, insights: HcpInsights): string {
  const slim = {
    identity: twin.identity ?? {
      name_zh: twin.profile.name_zh,
      hospital: twin.profile.hospital,
      department: twin.profile.department,
      title: twin.profile.title,
      city: twin.profile.city,
    },
    specialties: twin.profile.specialties,
    tags: twin.profile.tags
      ? {
          hcp_tier: twin.profile.tags.hcp_tier,
          role_tags: twin.profile.tags.role_tags,
        }
      : undefined,
    research_themes: twin.research?.themes ?? [],
    interest_directions: insights.interest_directions ?? [],
    opportunities: insights.opportunities ?? [],
  };
  return JSON.stringify(slim, null, 2);
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw agentError("LLM_ERROR", "LLM 未返回 JSON 对象", {
      details: { preview: raw.slice(0, 200) },
      retryable: true,
    });
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw agentError("LLM_ERROR", "LLM JSON 解析失败", {
      details: { preview: raw.slice(0, 200) },
      retryable: true,
    });
  }
}

function hasEnoughFacts(twin: VirtualTwin, insights: HcpInsights): boolean {
  const themes = twin.research?.themes?.length ?? 0;
  const interests = insights.interest_directions?.length ?? 0;
  const opps = insights.opportunities?.length ?? 0;
  const title = Boolean(twin.profile.title || twin.identity?.title);
  return themes + interests + opps >= 1 || title;
}

export type SynthesizeDoingNowResult = {
  doing_now: DoingNow;
  reused: boolean;
};

export async function synthesizeDoingNow(
  raw: unknown,
  deps?: { llm?: LlmClient },
): Promise<SynthesizeDoingNowResult> {
  const parsed = SynthesizeDoingNowInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw agentError("VALIDATION_ERROR", "synthesizeDoingNow 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }
  const { hcpId, refresh = false } = parsed.data;

  const twin = await getTwin(hcpId);
  if (!twin) {
    throw agentError("INSIGHTS_NOT_FOUND", "无 Twin", {
      repair_hint: "先完成分身确认保存",
      details: { hcpId },
    });
  }
  let insights = await getInsights(hcpId);
  if (!insights) {
    // MVP-2：允许仅有 Twin 时从公开字段合成骨架（验收不强制已跑 Stage）
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

  const existing = insights.doing_now;
  if (!refresh && existing?.summary?.trim()) {
    return { doing_now: existing, reused: true };
  }

  if (!hasEnoughFacts(twin, insights)) {
    throw agentError(
      "DOING_NOW_INPUT_INSUFFICIENT",
      "事实过少，无法生成可审计一句话洞察",
      {
        repair_hint: "补充 specialty/themes、兴趣或机会后再试",
      },
    );
  }

  const persist = async (doing_now: DoingNow) => {
    const asOf = doing_now.as_of || new Date().toISOString().slice(0, 10);
    const nextInsights: HcpInsights = {
      ...insights,
      doing_now,
      as_of: asOf,
    };
    await upsertInsights(nextInsights);
    return { doing_now, reused: false as const };
  };

  const llm =
    deps?.llm ??
    (() => {
      const c = createLlmClient();
      if ("error" in c) return null;
      return c;
    })();

  if (!llm) {
    if (isLlmStrict()) {
      const c = createLlmClient();
      if ("error" in c) throw c.error;
    }
    return persist(ruleSynthesizeDoingNow(twin, insights));
  }

  try {
    const result = await llm.chat([
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `请为以下 HCP 生成 doing_now JSON。\n\n${buildContext(twin, insights)}`,
      },
    ]);
    const json = extractJsonObject(result.content);
    const asOf = new Date().toISOString().slice(0, 10);
    const draft = DoingNowSchema.safeParse({
      ...(typeof json === "object" && json ? json : {}),
      as_of: asOf,
      llm: { provider: result.provider, model: result.model },
    });
    if (!draft.success) {
      throw agentError("LLM_ERROR", "LLM 产出不符合 DoingNow 契约", {
        details: { issues: draft.error.issues },
        retryable: true,
      });
    }
    return persist(draft.data);
  } catch (err) {
    if (isLlmStrict()) throw err as AgentError;
    return persist(ruleSynthesizeDoingNow(twin, insights));
  }
}
