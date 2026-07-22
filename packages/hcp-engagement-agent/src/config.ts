import { agentError, type AgentError } from "./types.js";

export type LlmProvider = "qwen" | "openai_compatible";

export type ResolvedLlmConfig = {
  provider: LlmProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
};

const DEFAULT_DASHSCOPE_BASE =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

export function resolveLlmConfig(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; config: ResolvedLlmConfig } | { ok: false; error: AgentError } {
  const providerRaw = (env.LLM_PROVIDER ?? "qwen").toLowerCase();
  if (providerRaw !== "qwen" && providerRaw !== "openai_compatible") {
    return {
      ok: false,
      error: agentError(
        "LLM_CONFIG_INVALID",
        `不支持的 LLM_PROVIDER=${providerRaw}`,
        {
          repair_hint: "设为 qwen 或 openai_compatible",
        },
      ),
    };
  }
  const provider = providerRaw as LlmProvider;

  const apiKey =
    env.LLM_API_KEY?.trim() ||
    (provider === "qwen" ? env.DASHSCOPE_API_KEY?.trim() : undefined) ||
    "";

  if (!apiKey) {
    return {
      ok: false,
      error: agentError("LLM_CONFIG_INVALID", "缺少 LLM API Key", {
        repair_hint:
          provider === "qwen"
            ? "设置 DASHSCOPE_API_KEY 或 LLM_API_KEY"
            : "设置 LLM_API_KEY",
      }),
    };
  }

  let baseUrl =
    env.LLM_BASE_URL?.trim() ||
    (provider === "qwen"
      ? env.DASHSCOPE_BASE_URL?.trim() || DEFAULT_DASHSCOPE_BASE
      : "");

  if (!baseUrl) {
    return {
      ok: false,
      error: agentError(
        "LLM_CONFIG_INVALID",
        "openai_compatible 须配置 LLM_BASE_URL",
        { repair_hint: "设置 LLM_BASE_URL 为 OpenAI 兼容端点" },
      ),
    };
  }
  baseUrl = baseUrl.replace(/\/$/, "");

  const model =
    env.LLM_MODEL?.trim() ||
    env.DASHSCOPE_MODEL?.trim() ||
    (provider === "qwen" ? "qwen-plus" : "gpt-4o-mini");

  const timeoutMs = Number(env.LLM_TIMEOUT_MS ?? "60000");
  const maxRetries = Number(env.LLM_MAX_RETRIES ?? "2");

  return {
    ok: true,
    config: {
      provider,
      model,
      baseUrl,
      apiKey,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 60_000,
      maxRetries: Number.isFinite(maxRetries) ? maxRetries : 2,
    },
  };
}

export function isLlmStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LLM_STRICT === "true";
}
