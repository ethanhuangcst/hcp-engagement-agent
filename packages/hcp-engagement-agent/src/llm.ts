import OpenAI from "openai";
import { resolveLlmConfig, type ResolvedLlmConfig } from "./config.js";
import { agentError, type AgentError, type LlmChatMessage, type LlmChatResult } from "./types.js";

export type LlmClient = {
  provider: string;
  model: string;
  chat(messages: LlmChatMessage[]): Promise<LlmChatResult>;
};

function mapOpenAiError(err: unknown): AgentError {
  const message = err instanceof Error ? err.message : String(err);
  const status =
    typeof err === "object" &&
    err &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : undefined;

  if (status === 401 || status === 403 || /auth|unauthorized|invalid.*key/i.test(message)) {
    return agentError("LLM_AUTH_FAILED", "LLM 鉴权失败", {
      details: { message },
      repair_hint: "检查 DASHSCOPE_API_KEY / LLM_API_KEY",
    });
  }
  if (status === 429 || /rate.?limit/i.test(message)) {
    return agentError("LLM_RATE_LIMITED", "LLM 限速", {
      details: { message },
      retryable: true,
    });
  }
  if (/timeout|ETIMEDOUT|AbortError/i.test(message)) {
    return agentError("LLM_TIMEOUT", "LLM 调用超时", {
      details: { message },
      retryable: true,
    });
  }
  return agentError("LLM_ERROR", "LLM 调用失败", {
    details: { message },
    retryable: true,
  });
}

export function createLlmClient(
  config?: ResolvedLlmConfig,
): LlmClient | { error: AgentError } {
  const resolved = config
    ? { ok: true as const, config }
    : resolveLlmConfig();
  if (!resolved.ok) return { error: resolved.error };

  const { provider, model, baseUrl, apiKey, timeoutMs, maxRetries } =
    resolved.config;

  const openai = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: timeoutMs,
    maxRetries,
  });

  return {
    provider,
    model,
    async chat(messages: LlmChatMessage[]): Promise<LlmChatResult> {
      try {
        const completion = await openai.chat.completions.create({
          model,
          messages,
          temperature: 0.2,
        });
        const content = completion.choices[0]?.message?.content?.trim() ?? "";
        if (!content) {
          throw agentError("LLM_ERROR", "LLM 返回空内容", { retryable: true });
        }
        return { content, provider, model };
      } catch (err) {
        if (
          typeof err === "object" &&
          err &&
          "code" in err &&
          typeof (err as AgentError).code === "string"
        ) {
          throw err;
        }
        throw mapOpenAiError(err);
      }
    },
  };
}

export async function probeLlm(client: LlmClient): Promise<boolean> {
  try {
    const r = await client.chat([
      { role: "user", content: "回复一个字：好" },
    ]);
    return r.content.length > 0;
  } catch {
    return false;
  }
}
