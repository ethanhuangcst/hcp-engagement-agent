/**
 * F-AGT-034：时延预算与按调用计时（AGT2-01）。
 * 预算初值见 specs/agent/agent-design.md §13.3（feature-03 验收时实测校准回写）。
 */
export const LATENCY_BUDGET_MS = {
  propose: 30_000,
  revise: 30_000,
  synthesize: 30_000,
  open_chat: 15_000,
} as const;

export type LatencyTask = keyof typeof LATENCY_BUDGET_MS;

export type LlmCallOutcome<T> = {
  value: T;
  latency_ms: number;
  over_budget: boolean;
};

/** 计时器异常时返回 NaN，不吞 LLM 原错误、不破坏返回值 */
function safeNow(): number {
  try {
    return Date.now();
  } catch {
    return Number.NaN;
  }
}

/** 包一层 LlmClient 调用，记录 elapsed 毫秒与是否超预算 */
export async function timeLlmCall<T>(
  fn: () => Promise<T>,
  budgetMs: number,
): Promise<LlmCallOutcome<T>> {
  const startedAt = safeNow();
  const value = await fn();
  const elapsed = safeNow() - startedAt;
  const latency_ms = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  return {
    value,
    latency_ms,
    over_budget: Number.isFinite(elapsed) && latency_ms > budgetMs,
  };
}