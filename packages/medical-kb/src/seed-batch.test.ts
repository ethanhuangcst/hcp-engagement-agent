import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  seedAcademicBatch,
  summarizeSeedBatch,
  type SeedBatchDeps,
} from "./seed-batch.js";

function makeDeps(overrides: Partial<SeedBatchDeps> = {}): SeedBatchDeps {
  return {
    ingestOnDemand: vi.fn(async (raw: unknown) => {
      const { specialty } = raw as { specialty: string };
      return {
        jobId: `job_${specialty}`,
        knowledge_status: "pending" as const,
      };
    }),
    coverageCheck: vi.fn(async () => ({
      status: "pending" as const,
      chunk_count: 0,
    })),
    getIngestStatus: vi.fn(async (raw: unknown) => {
      const { jobId } = raw as { jobId: string };
      return {
        jobId,
        status: "ready",
        knowledge_status: "ready" as const,
      };
    }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("seedAcademicBatch（feature-09 MKB2-02 批量种子）", () => {
  it("should_skip_specialty_already_ready", async () => {
    const deps = makeDeps({
      coverageCheck: vi.fn(async () => ({
        status: "ready" as const,
        chunk_count: 5,
      })),
    });
    const rows = await seedAcademicBatch(deps, {
      specialties: ["neurology"],
    });
    expect(rows).toEqual([
      {
        specialty: "neurology",
        outcome: "skipped_ready",
        knowledge_status: "ready",
      },
    ]);
    expect(deps.ingestOnDemand).not.toHaveBeenCalled();
  });

  it("should_isolate_single_specialty_failure_and_continue", async () => {
    const deps = makeDeps({
      ingestOnDemand: vi.fn(async (raw: unknown) => {
        const { specialty } = raw as { specialty: string };
        if (specialty === "cardiology") {
          throw Object.assign(new Error("boom"), { code: "INTERNAL_ERROR" });
        }
        return {
          jobId: `job_${specialty}`,
          knowledge_status: "pending" as const,
        };
      }),
    });
    const rows = await seedAcademicBatch(deps, {
      specialties: ["cardiology", "neurology"],
    });
    expect(rows.map((r) => r.outcome)).toEqual(["failed", "started"]);
    expect(rows[0]?.error).toBe("boom");
    expect(rows[1]?.jobId).toBe("job_neurology");
  });

  it("should_only_ingest_not_ready_on_rerun", async () => {
    const ingest = vi.fn(async (raw: unknown) => {
      const { specialty } = raw as { specialty: string };
      return {
        jobId: `job_${specialty}`,
        knowledge_status: "pending" as const,
      };
    });
    const readySet = new Set(["neurology"]);
    const deps = makeDeps({
      ingestOnDemand: ingest,
      coverageCheck: vi.fn(async (specialty: string) =>
        readySet.has(specialty)
          ? { status: "ready" as const, chunk_count: 6 }
          : { status: "pending" as const, chunk_count: 0 },
      ),
    });
    const rows = await seedAcademicBatch(deps, {
      specialties: ["neurology", "oncology", "cardiology"],
    });
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(rows.find((r) => r.specialty === "neurology")?.outcome).toBe(
      "skipped_ready",
    );
    expect(
      rows
        .filter((r) => r.outcome === "started")
        .map((r) => r.specialty)
        .sort(),
    ).toEqual(["cardiology", "oncology"]);
  });

  it("should_ingest_all_even_when_ready_when_force", async () => {
    const deps = makeDeps({
      coverageCheck: vi.fn(async () => ({
        status: "ready" as const,
        chunk_count: 9,
      })),
    });
    const rows = await seedAcademicBatch(deps, {
      specialties: ["neurology"],
      force: true,
    });
    expect(rows[0]?.outcome).toBe("started");
    expect(deps.ingestOnDemand).toHaveBeenCalled();
  });

  it("should_serialize_non_error_object_throws_in_log", async () => {
    const deps = makeDeps({
      ingestOnDemand: vi.fn(async () => {
        // 模拟 ragError 以普通对象 throw（非 Error 实例）
        throw { code: "INGEST_IN_PROGRESS", message: "busy" };
      }),
    });
    const rows = await seedAcademicBatch(deps, {
      specialties: ["cardiology"],
    });
    expect(rows[0]?.outcome).toBe("failed");
    expect(String(rows[0]?.error)).toContain("INGEST_IN_PROGRESS");
  });

  it("should_keep_polling_while_job_running_even_if_coverage_ready", async () => {
    // getIngestStatus 对 running job 会用 coverage 兜底出 knowledge_status=ready；
    // 轮询必须只认 job.status 终态，否则会提前退出并杀死 in-flight job
    let calls = 0;
    const deps = makeDeps({
      getIngestStatus: vi.fn(async (raw: unknown) => {
        const { jobId } = raw as { jobId: string };
        calls++;
        return calls < 3
          ? {
              jobId,
              status: "running",
              knowledge_status: "ready" as const,
            }
          : { jobId, status: "ready", knowledge_status: "ready" as const };
      }),
    });
    const rows = await seedAcademicBatch(deps, {
      specialties: ["urology"],
      waitForJobs: true,
      pollIntervalMs: 1,
      pollMax: 10,
    });
    expect(rows[0]?.outcome).toBe("started");
    expect(rows[0]?.knowledge_status).toBe("ready");
    expect(calls).toBe(3);
  });

  it("should_mark_failed_when_polled_job_fails", async () => {
    const deps = makeDeps({
      getIngestStatus: vi.fn(async (raw: unknown) => {
        const { jobId } = raw as { jobId: string };
        return {
          jobId,
          status: "failed",
          knowledge_status: "failed" as const,
          error: { code: "SOURCES_UNAVAILABLE" },
        };
      }),
    });
    const rows = await seedAcademicBatch(deps, {
      specialties: ["oncology"],
      waitForJobs: true,
      pollIntervalMs: 1,
      pollMax: 3,
    });
    expect(rows[0]?.outcome).toBe("failed");
    expect(rows[0]?.error).toEqual({ code: "SOURCES_UNAVAILABLE" });
  });

  it("should_stop_after_current_specialty_reaches_terminal_state_when_shouldStop", async () => {
    // F-RAG-029 / DEF-004：SIGTERM 后等当前学科 job 终态再退出，不中断轮询、不启动下一学科
    let stopped = false;
    let polls = 0;
    const deps = makeDeps({
      getIngestStatus: vi.fn(async (raw: unknown) => {
        const { jobId } = raw as { jobId: string };
        polls++;
        if (polls >= 3) stopped = true;
        return polls < 3
          ? { jobId, status: "running", knowledge_status: "pending" as const }
          : { jobId, status: "ready", knowledge_status: "ready" as const };
      }),
    });
    const rows = await seedAcademicBatch(deps, {
      specialties: ["urology", "oncology"],
      waitForJobs: true,
      pollIntervalMs: 1,
      pollMax: 10,
      shouldStop: () => stopped,
    });
    expect(rows.map((r) => r.specialty)).toEqual(["urology"]);
    expect(rows[0]?.outcome).toBe("started");
    expect(rows[0]?.knowledge_status).toBe("ready");
    expect(polls).toBe(3);
  });

  it("should_skip_remaining_specialties_immediately_when_shouldStop_before_next", async () => {
    let stopped = false;
    const deps = makeDeps({
      ingestOnDemand: vi.fn(async (raw: unknown) => {
        const { specialty } = raw as { specialty: string };
        if (specialty === "urology") stopped = true;
        return {
          jobId: `job_${specialty}`,
          knowledge_status: "pending" as const,
        };
      }),
    });
    const rows = await seedAcademicBatch(deps, {
      specialties: ["urology", "oncology", "cardiology"],
      shouldStop: () => stopped,
    });
    expect(rows.map((r) => r.specialty)).toEqual(["urology"]);
    expect(rows[0]?.outcome).toBe("started");
  });
});

describe("summarizeSeedBatch", () => {
  it("should_count_ready_failed_started", () => {
    const summary = summarizeSeedBatch([
      { specialty: "a", outcome: "skipped_ready" },
      { specialty: "b", outcome: "started" },
      { specialty: "c", outcome: "failed" },
    ]);
    expect(summary).toEqual({ total: 3, ready: 1, failed: 1, started: 1 });
  });
});
