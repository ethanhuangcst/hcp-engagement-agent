import type { DoingNow, HcpInsights } from "@hca/domain";
import { getInsights, getTwin, upsertInsights } from "@hca/db";
import { createLlmClient, type LlmClient } from "./llm.js";
import { hasEnoughFacts, llmDraftDoingNow } from "./synthesize.js";
import {
  agentError,
  SynthesizeDoingNowInputSchema,
} from "./types.js";

/**
 * ADR-013：一句话洞察的幂等合成入口。
 * 三个触发源（build 完成、TWIN2-01 定时、get_hcp_insights 按需）收敛到这里：
 * - `doing_now` 已存在 → 直接复用，不调 LLM；
 * - 同一 hcpId 进行中 → 复用同一次合成，不重复起任务；
 * - 事实不足 / 无 Key / LLM 失败 → pending，不抛错、不写库。
 */
export type EnsureDoingNowResult =
  | { status: "ready"; doing_now: DoingNow; reused: boolean }
  | {
      status: "pending";
      reason: "twin_missing" | "insufficient_facts" | "llm_unavailable";
    };

export type EnsureDoingNowDeps = {
  /** 测试注入；缺省按进程 env 创建（无 Key → pending） */
  llm?: LlmClient;
};

const inFlight = new Map<string, Promise<EnsureDoingNowResult>>();

export async function ensureDoingNow(
  raw: unknown,
  deps?: EnsureDoingNowDeps,
): Promise<EnsureDoingNowResult> {
  const parsed = SynthesizeDoingNowInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw agentError("VALIDATION_ERROR", "ensureDoingNow 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }
  const hcpId = parsed.data.hcpId;
  const running = inFlight.get(hcpId);
  if (running) return running;
  const task = runEnsure(hcpId, deps).finally(() => {
    inFlight.delete(hcpId);
  });
  inFlight.set(hcpId, task);
  return task;
}

async function runEnsure(
  hcpId: string,
  deps?: EnsureDoingNowDeps,
): Promise<EnsureDoingNowResult> {
  const twin = await getTwin(hcpId);
  if (!twin) return { status: "pending", reason: "twin_missing" };

  const insights: HcpInsights | null = await getInsights(hcpId);
  if (!insights) {
    return { status: "pending", reason: "insufficient_facts" };
  }

  const existing = insights.doing_now;
  if (existing?.summary?.trim()) {
    return { status: "ready", doing_now: existing, reused: true };
  }

  if (!hasEnoughFacts(twin, insights)) {
    return { status: "pending", reason: "insufficient_facts" };
  }

  const llm =
    deps?.llm ??
    (() => {
      const c = createLlmClient();
      return "error" in c ? null : c;
    })();
  if (!llm) return { status: "pending", reason: "llm_unavailable" };

  try {
    const doingNow = await llmDraftDoingNow(llm, twin, insights);
    const asOf = doingNow.as_of || new Date().toISOString().slice(0, 10);
    await upsertInsights({ ...insights, doing_now: doingNow, as_of: asOf });
    return { status: "ready", doing_now: doingNow, reused: false };
  } catch {
    return { status: "pending", reason: "llm_unavailable" };
  }
}

/** 测试用：清空进行中合成去重表 */
export function resetEnsureDoingNowForTests(): void {
  inFlight.clear();
}
