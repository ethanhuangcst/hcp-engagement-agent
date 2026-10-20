import cron, { type ScheduledTask } from "node-cron";
import { AGENT_GENERAL_HCP_ID, listTwins } from "@hca/db";
import type { TwinStore } from "../store.js";
import { getOrCreateBuildQueue } from "../tools-build.js";

export const DEFAULT_TWIN_REFRESH_TTL_HOURS = 24;

/** TWIN2-01 刷新模式：incremental 保留 user_override 标签（F-MCP-029） */
export const TWIN_REFRESH_MODE = "incremental" as const;

export type RefreshRoundResult = {
  due: number;
  refreshed: string[];
  skipped_ttl: string[];
  skipped_active: string[];
  failed: string[];
};

export type RefreshSchedulerDeps = {
  store: TwinStore;
  /** 测试注入；缺省 @hca/db listTwins() 的 hcp_id 列表（已排除 _agent_general） */
  listHcpIds?: () => Promise<string[]>;
  /** 测试注入；缺省共享 BuildQueue（incremental），等待 run 结束后返回结果 */
  enqueueAndWait?: (hcpId: string) => Promise<"done" | "active" | "failed">;
  now?: () => Date;
  ttlHours?: number;
  log?: (message: string) => void;
};

export type RefreshScheduler = {
  runOnce(): Promise<RefreshRoundResult>;
  /** 未配置 TWIN_REFRESH_CRON 或表达式无效 → 返回 null（关闭，1.0 行为一致） */
  start(cronExpression?: string): ScheduledTask | null;
  stop(): void;
};

function defaultLog(message: string) {
  /** 设计 §L89：stderr 结构化日志，无堆栈、无连接串、无 Key */
  console.error(JSON.stringify({ event: "twin_refresh", message }));
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function defaultListHcpIds(): Promise<string[]> {
  const items = await listTwins();
  return items.map((i) => i.hcp_id);
}

async function defaultEnqueueAndWait(
  store: TwinStore,
  hcpId: string,
): Promise<"done" | "active" | "failed"> {
  const queue = getOrCreateBuildQueue({ store });
  const enq = queue.enqueue(hcpId, TWIN_REFRESH_MODE);
  if (!enq.ok) return "active";
  await queue.waitFinished(enq.runId);
  return queue.getStatus(enq.runId)?.phase === "done" ? "done" : "failed";
}

/**
 * TWIN2-01 定时刷新（ADR-2.0-4 / ADR-013）：
 * 进程内 node-cron；未设 TWIN_REFRESH_CRON = 关闭；逐个顺序执行；
 * 距上次成功刷新（meta.built_at）不足 TTL 跳过；单个失败不阻断本轮。
 */
export function createRefreshScheduler(
  deps: RefreshSchedulerDeps,
): RefreshScheduler {
  const now = deps.now ?? (() => new Date());
  const ttlHours = deps.ttlHours ?? DEFAULT_TWIN_REFRESH_TTL_HOURS;
  const log = deps.log ?? defaultLog;
  const listHcpIds = deps.listHcpIds ?? defaultListHcpIds;
  const enqueueAndWait =
    deps.enqueueAndWait ?? ((hcpId: string) => defaultEnqueueAndWait(deps.store, hcpId));

  async function isDue(hcpId: string): Promise<boolean> {
    const twin = await deps.store.getTwin(hcpId);
    if (!twin) return false;
    const builtAtRaw = twin.meta.built_at;
    if (!builtAtRaw) return true;
    const builtAt = Date.parse(builtAtRaw);
    if (Number.isNaN(builtAt)) return true;
    return now().getTime() - builtAt >= ttlHours * 3_600_000;
  }

  async function runOnce(): Promise<RefreshRoundResult> {
    const result: RefreshRoundResult = {
      due: 0,
      refreshed: [],
      skipped_ttl: [],
      skipped_active: [],
      failed: [],
    };
    let ids: string[] = [];
    try {
      ids = (await listHcpIds()).filter((id) => id !== AGENT_GENERAL_HCP_ID);
    } catch (err) {
      log(`列出 HCP 失败，本轮中止：${errMessage(err)}`);
      return result;
    }
    for (const hcpId of ids) {
      let due: boolean;
      try {
        due = await isDue(hcpId);
      } catch (err) {
        result.failed.push(hcpId);
        log(`读取 Twin 失败，跳过 ${hcpId}：${errMessage(err)}`);
        continue;
      }
      if (!due) {
        result.skipped_ttl.push(hcpId);
        continue;
      }
      result.due += 1;
      let outcome: "done" | "active" | "failed";
      try {
        outcome = await enqueueAndWait(hcpId);
      } catch (err) {
        log(`刷新异常 ${hcpId}：${errMessage(err)}`);
        outcome = "failed";
      }
      if (outcome === "done") {
        result.refreshed.push(hcpId);
      } else if (outcome === "active") {
        result.skipped_active.push(hcpId);
      } else {
        result.failed.push(hcpId);
        log(`刷新失败 ${hcpId}；Twin 正文保留上次成功版本`);
      }
    }
    log(
      `本轮结束 due=${result.due} refreshed=${result.refreshed.length} ` +
        `skipped_ttl=${result.skipped_ttl.length} skipped_active=${result.skipped_active.length} ` +
        `failed=${result.failed.length}`,
    );
    return result;
  }

  let task: ScheduledTask | null = null;

  function start(cronExpression?: string): ScheduledTask | null {
    const expr = cronExpression ?? process.env.TWIN_REFRESH_CRON;
    if (!expr) return null;
    if (!cron.validate(expr)) {
      log(`TWIN_REFRESH_CRON 无效：${expr}；调度器关闭`);
      return null;
    }
    task = cron.schedule(expr, () => {
      void runOnce();
    });
    log(`定时刷新已开启：${expr}，TTL=${ttlHours}h`);
    return task;
  }

  function stop(): void {
    task?.stop();
    task = null;
  }

  return { runOnce, start, stop };
}
