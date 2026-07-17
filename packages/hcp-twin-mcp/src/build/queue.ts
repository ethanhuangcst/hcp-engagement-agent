import type { BuildMode, BuildStatus } from "./types.js";
import { PHASE_PROGRESS } from "./types.js";

type Runner = (status: BuildStatus, update: (patch: Partial<BuildStatus>) => void) => Promise<void>;

/**
 * 进程内构建队列：同一 hcpId 同时仅一个 active run（F-MCP-018 / 027）.
 */
export class BuildQueue {
  private readonly byRun = new Map<string, BuildStatus>();
  private readonly activeByHcp = new Map<string, string>();
  private readonly historyByHcp = new Map<string, string>();

  constructor(private readonly runner: Runner) {}

  getStatus(runId: string): BuildStatus | null {
    return this.byRun.get(runId) ?? null;
  }

  getActiveRunId(hcpId: string): string | null {
    return this.activeByHcp.get(hcpId) ?? null;
  }

  getLatestRunId(hcpId: string): string | null {
    return this.activeByHcp.get(hcpId) ?? this.historyByHcp.get(hcpId) ?? null;
  }

  enqueue(hcpId: string, mode: BuildMode): { ok: true; runId: string } | { ok: false; activeRunId: string } {
    const existing = this.activeByHcp.get(hcpId);
    if (existing) {
      return { ok: false, activeRunId: existing };
    }
    const runId = `run_${hcpId}_${Date.now()}`;
    const now = new Date().toISOString();
    const status: BuildStatus = {
      runId,
      hcpId,
      mode,
      phase: "queued",
      progress: PHASE_PROGRESS.queued,
      message: "已入队，等待 Stage A",
      updated_at: now,
      started_at: now,
    };
    this.byRun.set(runId, status);
    this.activeByHcp.set(hcpId, runId);
    this.historyByHcp.set(hcpId, runId);

    void this.run(runId);
    return { ok: true, runId };
  }

  private update(runId: string, patch: Partial<BuildStatus>) {
    const cur = this.byRun.get(runId);
    if (!cur) return;
    const next: BuildStatus = {
      ...cur,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    if (patch.phase && patch.progress === undefined) {
      next.progress = PHASE_PROGRESS[patch.phase];
    }
    this.byRun.set(runId, next);
  }

  private async run(runId: string) {
    const status = this.byRun.get(runId);
    if (!status) return;
    try {
      await this.runner(status, (patch) => this.update(runId, patch));
      this.update(runId, {
        phase: "done",
        progress: 1,
        message: "Stage A–E 完成",
        finished_at: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.update(runId, {
        phase: "error",
        progress: 1,
        message,
        finished_at: new Date().toISOString(),
        error: {
          code: "INTERNAL_ERROR",
          message,
          retryable: true,
        },
      });
    } finally {
      const cur = this.byRun.get(runId);
      if (cur && this.activeByHcp.get(cur.hcpId) === runId) {
        this.activeByHcp.delete(cur.hcpId);
      }
    }
  }
}
