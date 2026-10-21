import { CONTROLLED_SPECIALTY_KEYS } from "./specialty.js";

/**
 * feature-09（MKB2-02）：学术索引批量种子核心。
 * 依赖全部可注入，便于测试；默认绑定 academic.ts 真实实现。
 */

export type SeedBatchResultRow = {
  specialty: string;
  outcome: "skipped_ready" | "started" | "failed";
  jobId?: string;
  knowledge_status?: "ready" | "sparse" | "pending" | "failed";
  error?: unknown;
};

export type SeedBatchDeps = {
  ingestOnDemand: (raw: unknown) => Promise<{
    jobId: string;
    knowledge_status: "ready" | "sparse" | "pending";
  }>;
  coverageCheck: (
    specialty: string,
  ) => Promise<{ status: "ready" | "sparse" | "pending"; chunk_count: number }>;
  getIngestStatus: (raw: unknown) => Promise<{
    jobId: string;
    status: string;
    knowledge_status: "ready" | "sparse" | "pending" | "failed";
    error?: unknown;
  }>;
};

export type SeedAcademicBatchOptions = {
  specialties?: string[];
  force?: boolean;
  /** 每学科完成后是否轮询 job 终态（CLI 用 true） */
  waitForJobs?: boolean;
  /** 轮询间隔 ms，默认 2000 */
  pollIntervalMs?: number;
  /** 轮询上限次数，默认 60 */
  pollMax?: number;
  /** F-RAG-029 / DEF-004：信号陷阱。学科循环开头为真则停止；当前学科的 job 轮询不打断，等终态再退出 */
  shouldStop?: () => boolean;
};

function logStructured(row: SeedBatchResultRow): void {
  console.log(JSON.stringify({ event: "seed_batch", ...row }));
}

export async function seedAcademicBatch(
  deps: SeedBatchDeps,
  options: SeedAcademicBatchOptions = {},
): Promise<SeedBatchResultRow[]> {
  const specialties = options.specialties ?? [...CONTROLLED_SPECIALTY_KEYS];
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const pollMax = options.pollMax ?? 60;
  const rows: SeedBatchResultRow[] = [];

  for (const specialty of specialties) {
    if (options.shouldStop?.()) {
      console.log(
        JSON.stringify({
          event: "seed_batch_stopped",
          reason: "stop_requested",
          remaining: specialty,
        }),
      );
      break;
    }
    try {
      if (!options.force) {
        const coverage = await deps.coverageCheck(specialty);
        if (coverage.status === "ready") {
          const row: SeedBatchResultRow = {
            specialty,
            outcome: "skipped_ready",
            knowledge_status: "ready",
          };
          logStructured(row);
          rows.push(row);
          continue;
        }
      }

      const started = await deps.ingestOnDemand({ specialty, force: options.force });
      const row: SeedBatchResultRow = {
        specialty,
        outcome: "started",
        jobId: started.jobId,
        knowledge_status: started.knowledge_status,
      };
      logStructured(row);
      rows.push(row);

      if (options.waitForJobs && started.jobId) {
        for (let i = 0; i < pollMax; i++) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          const status = await deps.getIngestStatus({ jobId: started.jobId });
          // 只认 job.status 终态：running 时 knowledge_status 可能被 coverage 兜底成 ready
          if (
            status.status === "ready" ||
            status.status === "sparse" ||
            status.status === "failed"
          ) {
            if (status.status === "failed") {
              row.outcome = "failed";
              row.error = status.error;
              logStructured(row);
            } else {
              row.knowledge_status = status.status;
            }
            break;
          }
        }
      }
    } catch (err) {
      const row: SeedBatchResultRow = {
        specialty,
        outcome: "failed",
        error:
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null
              ? JSON.stringify(err)
              : String(err),
      };
      logStructured(row);
      rows.push(row);
    }
  }

  return rows;
}

export function summarizeSeedBatch(rows: SeedBatchResultRow[]): {
  total: number;
  ready: number;
  failed: number;
  started: number;
} {
  let ready = 0;
  let failed = 0;
  let started = 0;
  for (const row of rows) {
    if (row.outcome === "failed") failed++;
    else if (row.outcome === "skipped_ready") ready++;
    else started++;
  }
  return { total: rows.length, ready, failed, started };
}
