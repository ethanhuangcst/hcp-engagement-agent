import {
  EngagementOptionSchema,
  type EngagementOption,
  type EngagementOptionsRun,
} from "@hca/domain";
import {
  getEngagementOptionsRun,
  upsertEngagementOptions,
} from "@hca/db";
import { isLlmStrict } from "./config.js";
import { extractJsonObject } from "./json.js";
import { reviseSystemPrompt } from "./locale-prompt.js";
import { createLlmClient, type LlmClient } from "./llm.js";
import { agentError, type AgentError, type AgentLocale } from "./types.js";

export type ReviseEngagementResult = {
  options: EngagementOption[];
  reply: string;
  run: EngagementOptionsRun;
  llm?: { provider: string; model: string };
};

/** I-AGT-010 revise_engagement */
export async function reviseEngagement(
  input: {
    hcpId: string;
    optionRunId: string;
    feedback: string;
    optionId?: string;
    locale?: AgentLocale;
  },
  deps?: { llm?: LlmClient },
): Promise<ReviseEngagementResult> {
  const {
    hcpId,
    optionRunId,
    feedback,
    optionId,
    locale: localeRaw,
  } = input;
  const run = await getEngagementOptionsRun(optionRunId);
  if (!run || run.hcp_id !== hcpId) {
    throw agentError("OPTIONS_NOT_FOUND", "未找到方案运行", {
      details: { hcpId, optionRunId },
    });
  }
  const locale: AgentLocale =
    localeRaw ?? (run.locale as AgentLocale | undefined) ?? "zh-CN";
  const targetId = optionId ?? run.options[0]?.id;
  const current = run.options.find((o) => o.id === targetId);
  if (!current) {
    throw agentError("OPTIONS_NOT_FOUND", "未找到当前方案选项", {
      details: { optionId: targetId },
    });
  }

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
    return ruleRevise(run, current, feedback, locale);
  }

  try {
    const userContent =
      locale === "en"
        ? `Current option:\n${JSON.stringify(current, null, 2)}\n\nUser feedback: ${feedback}`
        : `当前方案：\n${JSON.stringify(current, null, 2)}\n\n用户反馈：${feedback}`;
    const result = await llm.chat([
      { role: "system", content: reviseSystemPrompt(locale) },
      { role: "user", content: userContent },
    ]);
    const json = extractJsonObject(result.content) as {
      option?: unknown;
      reply?: unknown;
    };
    const nextOpt = EngagementOptionSchema.safeParse({
      ...current,
      ...(typeof json.option === "object" && json.option ? json.option : {}),
      id: current.id,
      label: current.label,
    });
    if (!nextOpt.success) {
      throw agentError("LLM_ERROR", "修订后 Option 不合契约", {
        retryable: true,
      });
    }
    const options = run.options.map((o) =>
      o.id === current.id ? nextOpt.data : o,
    );
    const nextRun: EngagementOptionsRun = { ...run, options };
    await upsertEngagementOptions(nextRun);
    const fallbackReply =
      locale === "en"
        ? `Updated “${current.label}” from your feedback. Re-run the compliance gate; formal external use still needs MLR.`
        : `已按反馈修订「${current.label}」。请再送合规闸门检查；正式外发仍须 MLR。`;
    return {
      options,
      reply:
        typeof json.reply === "string" && json.reply.trim()
          ? json.reply.trim()
          : fallbackReply,
      run: nextRun,
      llm: { provider: result.provider, model: result.model },
    };
  } catch (err) {
    if (isLlmStrict()) throw err as AgentError;
    return ruleRevise(run, current, feedback, locale);
  }
}

async function ruleRevise(
  run: EngagementOptionsRun,
  current: EngagementOption,
  feedback: string,
  locale: AgentLocale,
): Promise<ReviseEngagementResult> {
  const note = feedback.slice(0, 120);
  const revised: EngagementOption = {
    ...current,
    compliance_note:
      locale === "en"
        ? `${current.compliance_note} | Revision intent: ${note}`
        : `${current.compliance_note}｜修订意向：${note}`,
    theme: /渠道|企微|科室会|MSL|拜访|channel|WeCom|department|visit/i.test(
      feedback,
    )
      ? locale === "en"
        ? `${current.theme} (focus adjusted per feedback)`
        : `${current.theme}（已按反馈调整侧重点）`
      : current.theme,
  };
  const options = run.options.map((o) =>
    o.id === current.id ? revised : o,
  );
  const nextRun: EngagementOptionsRun = { ...run, options };
  await upsertEngagementOptions(nextRun);
  return {
    options,
    reply:
      locale === "en"
        ? `Recorded revision intent for “${current.label}” and updated notes/theme. Use HCP Engagement Agent (open_chat) for open discussion. Formal external use still needs MLR.`
        : `已记录对「${current.label}」的修订意向并更新旁注/主题。完整开放讨论请用 HCP Engagement Agent（open_chat）。正式外发仍须 MLR。`,
    run: nextRun,
  };
}
