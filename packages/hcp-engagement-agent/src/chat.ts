import { randomUUID } from "node:crypto";
import type { ChatMessage, ChatSession, EngagementOptionsRun } from "@hca/domain";
import {
  getChatSession,
  getLatestEngagementOptions,
  listChatSessions,
  upsertChatSession,
} from "@hca/db";
import { isLlmStrict } from "./config.js";
import { getTwinInsights, slimInsightsForPrompt } from "./insights.js";
import { createLlmClient, type LlmClient } from "./llm.js";
import { reviseEngagement } from "./revise.js";
import {
  agentError,
  ChatInputSchema,
  type AgentError,
} from "./types.js";

const OPEN_SYSTEM = `你是 HCP Engagement Agent（中国市场）。
围绕当前 HCP 做访前问答与策略讨论。可引用已给洞察摘要。
硬边界：不编造说明书外疗效；不假设处方/统方；院内活动须提示机构同意与代表备案；不替代 MLR。
改写 Engagement Options 仅当用户明确要求；否则只给建议。用简洁中文回复。`;

export type ChatResult = {
  sessionId: string;
  mode: "open_chat" | "revise_options";
  messages: ChatMessage[];
  options?: EngagementOptionsRun["options"];
  optionRunId?: string;
};

/** I-AGT-003 chat */
export async function chat(
  raw: unknown,
  deps?: { llm?: LlmClient },
): Promise<ChatResult> {
  const parsed = ChatInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw agentError("VALIDATION_ERROR", "chat 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }
  const {
    mode,
    sessionId: incomingSessionId,
    hcpId,
    message,
    optionRunId,
    optionId,
    attachments,
  } = parsed.data;

  if (mode === "revise_options" && !optionRunId) {
    throw agentError("VALIDATION_ERROR", "revise_options 须提供 optionRunId", {
      repair_hint: "先生成一人一策方案",
    });
  }

  let session: ChatSession | null = null;
  if (incomingSessionId) {
    session = await getChatSession(incomingSessionId);
    if (session && session.mode !== mode) {
      throw agentError(
        "CHAT_MODE_MISMATCH",
        "同一 session 不可混用 open_chat 与 revise_options",
        {
          repair_hint: "切换模式时请新建会话",
          details: { sessionId: incomingSessionId, mode },
        },
      );
    }
    if (session && session.hcp_id !== hcpId) {
      throw agentError("VALIDATION_ERROR", "session 与 hcpId 不匹配", {
        details: { sessionId: incomingSessionId, hcpId },
      });
    }
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const userMsg: ChatMessage = {
    role: "user",
    content: message,
    attachments,
    created_at: now,
  };

  if (mode === "revise_options") {
    const revise = await reviseEngagement(
      {
        hcpId,
        optionRunId: optionRunId!,
        feedback: message,
        optionId,
      },
      deps,
    );
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: revise.reply,
      created_at: new Date().toISOString(),
    };
    const next: ChatSession = {
      session_id: session?.session_id ?? `chs_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      hcp_id: hcpId,
      mode,
      option_run_id: optionRunId,
      option_id: optionId,
      title: session?.title ?? `修订 · ${optionId ?? "当前方案"}`,
      messages: [...(session?.messages ?? []), userMsg, assistantMsg],
      as_of: asOf,
      llm: revise.llm,
    };
    await upsertChatSession(next);
    return {
      sessionId: next.session_id,
      mode,
      messages: next.messages,
      options: revise.options,
      optionRunId,
    };
  }

  // open_chat
  const bundle = await getTwinInsights(hcpId);
  const latest = await getLatestEngagementOptions(hcpId);
  const attachNote =
    attachments && attachments.length > 0
      ? `\n附件：${attachments.map((a) => a.name + (a.summary ? `(${a.summary})` : "")).join("、")}`
      : "";

  const llm =
    deps?.llm ??
    (() => {
      const c = createLlmClient();
      if ("error" in c) return null;
      return c;
    })();

  let reply: string;
  let llmMeta: ChatSession["llm"];

  if (!llm) {
    if (isLlmStrict()) {
      const c = createLlmClient();
      if ("error" in c) throw c.error;
    }
    const name =
      bundle.twin.identity?.name_zh ?? bundle.twin.profile.name_zh;
    reply = [
      `围绕 ${name}：${bundle.insights.doing_now?.summary ?? "洞察摘要暂缺"}。`,
      latest
        ? `当前一人一策共 ${latest.options.length} 条（run=${latest.run_id}）；若要改写方案请明确说明，或到一人一策页底用修订模式。`
        : "尚未生成一人一策；可在工作台「一人一策」生成方案。",
      "边界：院内活动须机构同意与代表备案；不替代正式 MLR。",
      attachNote ? `已收到附件元数据。${attachNote}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    try {
      const history = (session?.messages ?? [])
        .slice(-8)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const result = await llm.chat([
        { role: "system", content: OPEN_SYSTEM },
        {
          role: "user",
          content: `当前 HCP 洞察摘要：\n${slimInsightsForPrompt(bundle)}\n\n最新方案概要：${
            latest
              ? latest.options
                  .map((o) => `${o.label}:${o.action}`)
                  .join("；")
              : "无"
          }${attachNote}`,
        },
        ...history,
        { role: "user", content: message },
      ]);
      reply = result.content;
      llmMeta = { provider: result.provider, model: result.model };
    } catch (err) {
      if (isLlmStrict()) throw err as AgentError;
      reply =
        "模型暂不可用。请稍后重试，或先在一人一策查看已生成方案。院内活动须机构同意；不替代 MLR。";
    }
  }

  const assistantMsg: ChatMessage = {
    role: "assistant",
    content: reply,
    created_at: new Date().toISOString(),
  };
  const next: ChatSession = {
    session_id:
      session?.session_id ??
      `chs_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    hcp_id: hcpId,
    mode: "open_chat",
    option_run_id: optionRunId ?? latest?.run_id,
    title:
      session?.title ??
      `${bundle.twin.identity?.name_zh ?? bundle.twin.profile.name_zh} · 对话`,
    messages: [...(session?.messages ?? []), userMsg, assistantMsg],
    as_of: asOf,
    llm: llmMeta,
  };
  await upsertChatSession(next);
  return {
    sessionId: next.session_id,
    mode: "open_chat",
    messages: next.messages,
    options: latest?.options,
    optionRunId: next.option_run_id,
  };
}

export async function listOpenChatSessions(hcpId: string) {
  return listChatSessions(hcpId, "open_chat");
}
