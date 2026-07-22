import {
  DoingNowSchema,
  pickInsightsNarrative,
  withInsightsLocale,
  type DoingNow,
  type HcpInsights,
  type VirtualTwin,
} from "@hca/domain";
import { getInsights, getTwin, upsertInsights } from "@hca/db";
import { isLlmStrict } from "./config.js";
import { createLlmClient, type LlmClient } from "./llm.js";
import { doingNowSystemPrompt } from "./locale-prompt.js";
import { ruleSynthesizeDoingNow } from "./rule-doing-now.js";
import { extractJsonObject } from "./json.js";
import {
  agentError,
  SynthesizeDoingNowInputSchema,
  type AgentError,
  type AgentLocale,
} from "./types.js";

function buildContext(twin: VirtualTwin, insights: HcpInsights): string {
  const slim = {
    identity: twin.identity ?? {
      name_zh: twin.profile.name_zh,
      name_en: twin.profile.name_en,
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

function skeletonInsights(
  hcpId: string,
  twin: VirtualTwin,
  locale: AgentLocale,
): HcpInsights {
  const base =
    locale === "en"
      ? {
          hcp_id: hcpId,
          as_of: twin.meta.as_of,
          interest_directions: (twin.research?.themes ?? []).map((t) => ({
            title: String(t),
            analysis: "Draft interest axis derived from research.themes",
            confidence: "medium",
          })),
          opportunities: [
            {
              title: "Academic literature / topic discussion entry",
              priority: "medium",
              note: "Do not assume Rx or hospital-access intent",
            },
          ],
          evidence: [] as unknown[],
        }
      : {
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
          evidence: [] as unknown[],
        };
  return withInsightsLocale(base, locale, {
    interest_directions: base.interest_directions,
    opportunities: base.opportunities,
    evidence: base.evidence,
  });
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
  const { hcpId, refresh = false, locale: localeRaw } = parsed.data;
  const locale: AgentLocale = localeRaw ?? "zh-CN";

  const twin = await getTwin(hcpId);
  if (!twin) {
    throw agentError("INSIGHTS_NOT_FOUND", "无 Twin", {
      repair_hint: "先完成分身确认保存",
      details: { hcpId },
    });
  }
  let insights = await getInsights(hcpId);
  if (!insights) {
    insights = skeletonInsights(hcpId, twin, locale);
  }

  const bucket = pickInsightsNarrative(insights, locale);
  const existing = bucket.doing_now;
  if (!refresh && existing?.summary?.trim()) {
    return { doing_now: existing, reused: true };
  }

  // Fact check uses full insights (themes etc.) not only current bucket.
  if (!hasEnoughFacts(twin, insights)) {
    throw agentError(
      "DOING_NOW_INPUT_INSUFFICIENT",
      "事实过少，无法生成可审计一句话洞察",
      {
        repair_hint: "补充 specialty/themes、兴趣或机会后再试",
      },
    );
  }

  const contextInsights: HcpInsights = {
    ...insights,
    ...bucket,
    hcp_id: insights.hcp_id,
    as_of: insights.as_of,
  };

  const persist = async (doing_now: DoingNow) => {
    const asOf = doing_now.as_of || new Date().toISOString().slice(0, 10);
    const withLocale: DoingNow = { ...doing_now, locale, as_of: asOf };
    const prevBucket =
      insights.locales?.[locale] ??
      (locale === "zh-CN" ? pickInsightsNarrative(insights, "zh-CN") : {});
    const nextInsights = withInsightsLocale(insights, locale, {
      ...prevBucket,
      doing_now: withLocale,
    });
    await upsertInsights(nextInsights);
    return { doing_now: withLocale, reused: false as const };
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
    return persist(ruleSynthesizeDoingNow(twin, contextInsights, locale));
  }

  try {
    const userPrompt =
      locale === "en"
        ? `Generate doing_now JSON for this HCP.\n\n${buildContext(twin, contextInsights)}`
        : `请为以下 HCP 生成 doing_now JSON。\n\n${buildContext(twin, contextInsights)}`;
    const result = await llm.chat([
      { role: "system", content: doingNowSystemPrompt(locale) },
      { role: "user", content: userPrompt },
    ]);
    const json = extractJsonObject(result.content);
    const asOf = new Date().toISOString().slice(0, 10);
    const draft = DoingNowSchema.safeParse({
      ...(typeof json === "object" && json ? json : {}),
      as_of: asOf,
      locale,
      llm: { provider: result.provider, model: result.model },
    });
    if (!draft.success) {
      throw agentError("LLM_ERROR", "LLM 产出不符合 DoingNow 契约", {
        details: { issues: draft.error.issues },
        retryable: true,
      });
    }
    if (locale === "en" && /[\u4e00-\u9fff]/.test(draft.data.summary)) {
      return persist(ruleSynthesizeDoingNow(twin, contextInsights, locale));
    }
    return persist(draft.data);
  } catch (err) {
    if (isLlmStrict()) throw err as AgentError;
    return persist(ruleSynthesizeDoingNow(twin, contextInsights, locale));
  }
}
