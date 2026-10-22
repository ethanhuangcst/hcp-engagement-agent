import { randomUUID } from "node:crypto";
import type { ChatMessage, ChatSession, EngagementOptionsRun } from "@hca/domain";
import {
  getChatSession,
  listChatSessions,
  upsertChatSession,
} from "@hca/db";
import { isLlmStrict } from "./config.js";
import { createLlmClient, type LlmClient } from "./llm.js";
import { LATENCY_BUDGET_MS, timeLlmCall } from "./latency.js";
import { PROMPTS_V1 } from "./prompts/v1/index.js";
import { reviseEngagement } from "./revise.js";
import {
  AGENT_GENERAL_HCP_ID,
  agentError,
  ChatInputSchema,
  type AgentError,
} from "./types.js";

const OPEN_SYSTEM = PROMPTS_V1.open_chat.text;

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
      template: revise.template,
      latency_ms: revise.latency_ms,
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
  let chatLatencyMs: number | undefined;

  if (!llm) {
    if (isLlmStrict()) {
      const c = createLlmClient();
      if ("error" in c) throw c.error;
    }
    reply = [
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
      const outcome = await timeLlmCall(
        () =>
          llm.chat([
            { role: "system", content: OPEN_SYSTEM },
            ...(attachNote
              ? ([
                  {
                    role: "user" as const,
                    content: `本轮附件元数据：${attachNote}`,
                  },
                ] as const)
              : []),
            ...history,
            { role: "user", content: message },
          ]),
        LATENCY_BUDGET_MS.open_chat,
      );
      const result = outcome.value;
      reply = result.content;
      llmMeta = { provider: result.provider, model: result.model };
      chatLatencyMs = outcome.latency_ms;
    } catch (err) {
      if (isLlmStrict()) throw err as AgentError;
      reply =
        "模型暂不可用。请稍后重试。院内活动须机构同意；不替代 MLR。";
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
    template: { name: PROMPTS_V1.open_chat.name, version: PROMPTS_V1.open_chat.version },
    ...(chatLatencyMs !== undefined ? { latency_ms: chatLatencyMs } : {}),
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
