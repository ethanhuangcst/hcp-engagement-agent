import { randomUUID } from "node:crypto";
import type { ChatMessage, ChatSession, EngagementOptionsRun } from "@hca/domain";
import {
  getChatSession,
  listChatSessions,
  upsertChatSession,
} from "@hca/db";
import { isLlmStrict } from "./config.js";
import { createLlmClient, type LlmClient } from "./llm.js";
import { openChatSystemPrompt } from "./locale-prompt.js";
import { reviseEngagement } from "./revise.js";
import {
  AGENT_GENERAL_HCP_ID,
  agentError,
  ChatInputSchema,
  type AgentError,
  type AgentLocale,
} from "./types.js";

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
    locale: localeRaw,
  } = parsed.data;
  const locale: AgentLocale = localeRaw ?? "zh-CN";

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
    if (
      mode === "revise_options" &&
      session &&
      hcpId &&
      session.hcp_id !== hcpId
    ) {
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
        hcpId: hcpId!,
        optionRunId: optionRunId!,
        feedback: message,
        optionId,
        locale,
      },
      deps,
    );
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: revise.reply,
      created_at: new Date().toISOString(),
    };
    const next: ChatSession = {
      session_id:
        session?.session_id ??
        `chs_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      hcp_id: hcpId!,
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

  // open_chat：通用 Agent，不绑定分身洞察
  const workspaceId = AGENT_GENERAL_HCP_ID;
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
    reply =
      locale === "en"
        ? [
            "This is a general open chat, not bound to a specific HCP twin.",
            "Ask about disease-area finding, channel/compliance bounds, or pre-call prep; to revise a twin's Engagement Options, use the workspace Options tab footer.",
            "Bounds: hospital activities need institutional consent and rep registration; does not replace formal MLR.",
            attachNote ? `Attachment metadata received.${attachNote}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : [
            "这是通用开放对话，未绑定某一位医生数字分身。",
            "可继续问疾病领域找人、渠道/合规边界或访前准备；若要基于某位 HCP 的一人一策修订，请到工作台「一人一策」页底。",
            "边界：院内活动须机构同意与代表备案；不替代正式 MLR。",
            attachNote ? `已收到附件元数据。${attachNote}` : "",
          ]
            .filter(Boolean)
            .join("\n");
  } else {
    try {
      const history = (session?.messages ?? [])
        .slice(-10)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      const result = await llm.chat([
        { role: "system", content: openChatSystemPrompt(locale) },
        ...(attachNote
          ? ([
              {
                role: "user" as const,
                content:
                  locale === "en"
                    ? `Attachment metadata this turn:${attachNote}`
                    : `本轮附件元数据：${attachNote}`,
              },
            ] as const)
          : []),
        ...history,
        { role: "user", content: message },
      ]);
      reply = result.content;
      llmMeta = { provider: result.provider, model: result.model };
    } catch (err) {
      if (isLlmStrict()) throw err as AgentError;
      reply =
        locale === "en"
          ? "Model unavailable. Retry later. Hospital activities need institutional consent; does not replace MLR."
          : "模型暂不可用。请稍后重试。院内活动须机构同意；不替代 MLR。";
    }
  }

  const assistantMsg: ChatMessage = {
    role: "assistant",
    content: reply,
    created_at: new Date().toISOString(),
  };
  const titleSeed = message.trim().slice(0, 20) || "开放对话";
  const next: ChatSession = {
    session_id:
      session?.session_id ??
      `chs_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    hcp_id: workspaceId,
    mode: "open_chat",
    title: session?.title ?? titleSeed,
    messages: [...(session?.messages ?? []), userMsg, assistantMsg],
    as_of: asOf,
    llm: llmMeta,
  };
  await upsertChatSession(next);
  return {
    sessionId: next.session_id,
    mode: "open_chat",
    messages: next.messages,
  };
}

export async function listOpenChatSessions(hcpId?: string) {
  return listChatSessions(hcpId ?? AGENT_GENERAL_HCP_ID, "open_chat");
}
