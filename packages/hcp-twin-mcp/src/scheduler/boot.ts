import { ensureDoingNow } from "@hca/hcp-engagement-agent";
import type { TwinStore } from "../store.js";
import { getOrCreateBuildQueue } from "../tools-build.js";
import { createRefreshScheduler, type RefreshScheduler } from "./refresh.js";

/**
 * ADR-013 / TWIN2-01 进程装配层（transport 启动时调用）：
 * - build 成功 → ensureDoingNow 幂等合成一句话洞察（失败只打日志，不影响构建状态）；
 * - 定时刷新 → 未设 TWIN_REFRESH_CRON 即关闭，1.0 部署行为不变。
 * 单独成文件：scheduler 单测不引入 @hca/hcp-engagement-agent 的 dist 依赖。
 */
export function wireBuildBackfill(store: TwinStore): void {
  getOrCreateBuildQueue({
    store,
    onBuildComplete: async (hcpId) => {
      await ensureDoingNow({ hcpId });
    },
  });
}

function parseTtlHours(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

export function startRefreshSchedulerFromEnv(
  store: TwinStore,
): RefreshScheduler | null {
  const ttlHours = parseTtlHours(process.env.TWIN_REFRESH_TTL_HOURS);
  const scheduler = createRefreshScheduler(
    ttlHours ? { store, ttlHours } : { store },
  );
  const started = scheduler.start();
  return started ? scheduler : null;
}
