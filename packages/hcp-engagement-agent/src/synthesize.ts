import {
  DoingNowSchema,
  type DoingNow,
  type HcpInsights,
  type VirtualTwin,
} from "@hca/domain";
import { getInsights, getTwin, upsertInsights } from "@hca/db";
import { isLlmStrict } from "./config.js";
import { createLlmClient, type LlmClient } from "./llm.js";
import { LATENCY_BUDGET_MS, timeLlmCall } from "./latency.js";
import { PROMPTS_V1 } from "./prompts/v1/index.js";
import { ruleSynthesizeDoingNow } from "./rule-doing-now.js";
import { extractJsonObject } from "./json.js";
import {
  agentError,
  SynthesizeDoingNowInputSchema,
  type AgentError,
} from "./types.js";

const SYSTEM = PROMPTS_V1.synthesize.text;

export { SYSTEM as SYNTH_SYSTEM };

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

function hasEnoughFacts(twin: VirtualTwin, insights: HcpInsights): boolean {
  const themes = twin.research?.themes?.length ?? 0;
  const interests = insights.interest_directions?.length ?? 0;
  const opps = insights.opportunities?.length ?? 0;
  const title = Boolean(twin.profile.title || twin.identity?.title);
  return themes + interests + opps >= 1 || title;
}
export { hasEnoughFacts };

/**
 * ADR-013：LLM 路径草稿（synthesizeDoingNow 与 ensureDoingNow 共用）。
 * 失败抛 AgentError（LLM_*）；不落库。
 */
export async function llmDraftDoingNow(
  llm: LlmClient,
  twin: VirtualTwin,
  insights: HcpInsights,
): Promise<DoingNow> {
  const outcome = await timeLlmCall(
    () =>
      llm.chat([
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `请为以下 HCP 生成 doing_now JSON。\n\n${buildContext(twin, insights)}`,
        },
      ]),
    LATENCY_BUDGET_MS.synthesize,
  );
  const result = outcome.value;
  const json = extractJsonObject(result.content);
  const asOf = new Date().toISOString().slice(0, 10);
  const draft = DoingNowSchema.safeParse({
    ...(typeof json === "object" && json ? json : {}),
    as_of: asOf,
    llm: { provider: result.provider, model: result.model },
    template: {
      name: PROMPTS_V1.synthesize.name,
      version: PROMPTS_V1.synthesize.version,
    },
    latency_ms: outcome.latency_ms,
  });
  if (!draft.success) {
    throw agentError("LLM_ERROR", "LLM 产出不符合 DoingNow 契约", {
      details: { issues: draft.error.issues },
      retryable: true,
    });
  }
  return draft.data;
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
    return persist({ ...ruleSynthesizeDoingNow(twin, insights), degraded: true });
  }

  try {
    return persist(await llmDraftDoingNow(llm, twin, insights));
  } catch (err) {
    if (isLlmStrict()) throw err as AgentError;
    return persist({ ...ruleSynthesizeDoingNow(twin, insights), degraded: true });
  }
}
