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
import { createLlmClient, type LlmClient } from "./llm.js";
import { agentError, type AgentError } from "./types.js";

const SYSTEM = `你是中国市场 HCP Engagement 修订助手。
根据用户反馈修订**当前一条** Engagement Option。
硬约束：不编造疗效；不引入统方/销量；院内会保留机构同意与代表备案旁注；不替代 MLR。
只输出 JSON：{"option":{...完整 Option 字段},"reply":"给用户的中文说明（2–4句）"}`;

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
  },
  deps?: { llm?: LlmClient },
): Promise<ReviseEngagementResult> {
  const { hcpId, optionRunId, feedback, optionId } = input;
  const run = await getEngagementOptionsRun(optionRunId);
  if (!run || run.hcp_id !== hcpId) {
    throw agentError("OPTIONS_NOT_FOUND", "未找到方案运行", {
      details: { hcpId, optionRunId },
    });
  }
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
    return ruleRevise(run, current, feedback);
  }

  try {
    const result = await llm.chat([
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `当前方案：\n${JSON.stringify(current, null, 2)}\n\n用户反馈：${feedback}`,
      },
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
    return {
      options,
      reply:
        typeof json.reply === "string" && json.reply.trim()
          ? json.reply.trim()
          : `已按反馈修订「${current.label}」。请再送合规闸门检查；正式外发仍须 MLR。`,
      run: nextRun,
      llm: { provider: result.provider, model: result.model },
    };
  } catch (err) {
    if (isLlmStrict()) throw err as AgentError;
    return ruleRevise(run, current, feedback);
  }
}

async function ruleRevise(
  run: EngagementOptionsRun,
  current: EngagementOption,
  feedback: string,
): Promise<ReviseEngagementResult> {
  const note = feedback.slice(0, 120);
  const revised: EngagementOption = {
    ...current,
    compliance_note: `${current.compliance_note}｜修订意向：${note}`,
    theme: /渠道|企微|科室会|MSL|拜访/.test(feedback)
      ? `${current.theme}（已按反馈调整侧重点）`
      : current.theme,
  };
  const options = run.options.map((o) =>
    o.id === current.id ? revised : o,
  );
  const nextRun: EngagementOptionsRun = { ...run, options };
  await upsertEngagementOptions(nextRun);
  return {
    options,
    reply: `已记录对「${current.label}」的修订意向并更新旁注/主题。完整开放讨论请用 HCP Engagement Agent（open_chat）。正式外发仍须 MLR。`,
    run: nextRun,
  };
}
