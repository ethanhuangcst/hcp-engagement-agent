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
import { LATENCY_BUDGET_MS, timeLlmCall } from "./latency.js";
import { createLlmClient, type LlmClient } from "./llm.js";
import { PROMPTS_V1 } from "./prompts/v1/index.js";
import { agentError, type AgentError } from "./types.js";

const REVISE_SYSTEM = PROMPTS_V1.revise.text;

export { REVISE_SYSTEM };

export type ReviseEngagementResult = {
  options: EngagementOption[];
  reply: string;
  run: EngagementOptionsRun;
  llm?: { provider: string; model: string };
  template?: { name: string; version: string };
  latency_ms?: number;
};

/** 本次生成关联的模板版本元数据（AGT2-01） */
const REVISE_TEMPLATE = {
  name: PROMPTS_V1.revise.name,
  version: PROMPTS_V1.revise.version,
} as const;

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
    return ruleRevise(run, current, feedback, {
      template: REVISE_TEMPLATE,
      degraded: true,
    });
  }

  try {
    const outcome = await timeLlmCall(
      () =>
        llm.chat([
          { role: "system", content: REVISE_SYSTEM },
          {
            role: "user",
            content: `当前方案：\n${JSON.stringify(current, null, 2)}\n\n用户反馈：${feedback}`,
          },
        ]),
      LATENCY_BUDGET_MS.revise,
    );
    const result = outcome.value;
    const json = extractJsonObject(result.content) as {
      option?: unknown;
      reply?: unknown;
    };
    const nextOpt = EngagementOptionSchema.safeParse({
      ...current,
      ...(typeof json.option === "object" && json.option ? json.option : {}),
      id: current.id,
      label: current.label,
      // 引用以生成时校验过的 refs 为准，LLM 修订不得覆写
      academic_refs: current.academic_refs,
      compliance_refs: current.compliance_refs,
    });
    if (!nextOpt.success) {
      throw agentError("LLM_ERROR", "修订后 Option 不合契约", {
        retryable: true,
      });
    }
    const options = run.options.map((o) =>
      o.id === current.id ? nextOpt.data : o,
    );
    const nextRun: EngagementOptionsRun = {
      ...run,
      options,
      meta: {
        ...run.meta,
        template: { name: REVISE_TEMPLATE.name, version: REVISE_TEMPLATE.version },
        latency_ms: outcome.latency_ms,
        ...(outcome.over_budget ? { latency_over_budget: true } : {}),
      },
    };
    await upsertEngagementOptions(nextRun);
    return {
      options,
      reply:
        typeof json.reply === "string" && json.reply.trim()
          ? json.reply.trim()
          : `已按反馈修订「${current.label}」。请再送合规闸门检查；正式外发仍须 MLR。`,
      run: nextRun,
      llm: { provider: result.provider, model: result.model },
      template: { name: REVISE_TEMPLATE.name, version: REVISE_TEMPLATE.version },
      latency_ms: outcome.latency_ms,
    };
  } catch (err) {
    if (isLlmStrict()) throw err as AgentError;
    return ruleRevise(run, current, feedback, {
      template: REVISE_TEMPLATE,
      degraded: true,
    });
  }
}

async function ruleRevise(
  run: EngagementOptionsRun,
  current: EngagementOption,
  feedback: string,
  metaPatch?: { template?: { name: string; version: string }; degraded?: boolean },
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
  const nextRun: EngagementOptionsRun = {
    ...run,
    options,
    meta: { ...run.meta, ...metaPatch },
  };
  await upsertEngagementOptions(nextRun);
  return {
    options,
    reply: `已记录对「${current.label}」的修订意向并更新旁注/主题。完整开放讨论请用 HCP Engagement Agent（open_chat）。正式外发仍须 MLR。`,
    run: nextRun,
    template: metaPatch?.template ?? {
      name: REVISE_TEMPLATE.name,
      version: REVISE_TEMPLATE.version,
    },
  };
}
