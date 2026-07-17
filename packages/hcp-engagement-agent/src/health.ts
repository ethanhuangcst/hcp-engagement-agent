import { pingDatabase } from "@hca/db";
import { resolveLlmConfig } from "./config.js";
import { createLlmClient, probeLlm } from "./llm.js";

export type AgentHealth = {
  ok: boolean;
  database_ok: boolean;
  llm: {
    provider: string;
    model: string;
    reachable: boolean;
    configured: boolean;
  };
  error?: unknown;
};

export async function health(opts?: {
  probeLlm?: boolean;
}): Promise<AgentHealth> {
  const database_ok = await pingDatabase();
  const resolved = resolveLlmConfig();
  if (!resolved.ok) {
    return {
      ok: false,
      database_ok,
      llm: {
        provider: process.env.LLM_PROVIDER ?? "qwen",
        model: process.env.LLM_MODEL ?? "qwen-plus",
        reachable: false,
        configured: false,
      },
      error: resolved.error,
    };
  }

  const client = createLlmClient(resolved.config);
  if ("error" in client) {
    return {
      ok: false,
      database_ok,
      llm: {
        provider: resolved.config.provider,
        model: resolved.config.model,
        reachable: false,
        configured: false,
      },
      error: client.error,
    };
  }

  const reachable =
    opts?.probeLlm === false ? true : await probeLlm(client);

  return {
    ok: database_ok && reachable,
    database_ok,
    llm: {
      provider: client.provider,
      model: client.model,
      reachable,
      configured: true,
    },
    ...(!database_ok || !reachable
      ? {
          error: {
            code: !database_ok ? "INTERNAL_ERROR" : "LLM_ERROR",
            message: !database_ok ? "数据库不可达" : "LLM 探测失败",
          },
        }
      : {}),
  };
}
