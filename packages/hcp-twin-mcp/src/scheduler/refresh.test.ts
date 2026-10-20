import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cron, { type ScheduledTask } from "node-cron";
import type { VirtualTwin } from "@hca/domain";
import { createMemoryStore, type TwinStore } from "../store.js";
import {
  createRefreshScheduler,
  DEFAULT_TWIN_REFRESH_TTL_HOURS,
  type RefreshSchedulerDeps,
} from "./refresh.js";

/** mock schedule：捕获到点回调，validate 保持真实实现 */
vi.mock("node-cron", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node-cron")>();
  const schedule = vi.fn(
    () => ({ stop: () => {} }) as unknown as ScheduledTask,
  );
  return {
    ...actual,
    schedule,
    default: { ...actual, schedule, validate: actual.validate },
  };
});

const NOW = new Date("2026-10-20T02:00:00.000Z");

function twinWith(hcpId: string, builtAt: string | undefined): VirtualTwin {
  return {
    meta: {
      schema_version: "twin-2.0",
      hcp_id: hcpId,
      as_of: "2026-10-20",
      twin_version: 1,
      ...(builtAt ? { built_at: builtAt } : {}),
    },
    profile: {
      name_zh: "测试",
      hospital: "医院",
      department: "科室",
      disambiguation_status: "resolved",
      specialties: [],
    },
  } as VirtualTwin;
}

function makeDeps(
  twins: VirtualTwin[],
  overrides?: Partial<RefreshSchedulerDeps>,
): RefreshSchedulerDeps & { store: TwinStore } {
  const store = createMemoryStore();
  for (const t of twins) void store.upsertTwin(t);
  return {
    store,
    now: () => NOW,
    ttlHours: 24,
    log: () => {},
    listHcpIds: async () => twins.map((t) => t.meta.hcp_id),
    ...overrides,
  };
}

describe("TWIN2-01 定时刷新调度器", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should_default_ttl_to_24_hours", () => {
    expect(DEFAULT_TWIN_REFRESH_TTL_HOURS).toBe(24);
  });

  it("should_not_start_when_cron_env_absent", () => {
    vi.stubEnv("TWIN_REFRESH_CRON", "");
    const deps = makeDeps([]);
    const scheduler = createRefreshScheduler(deps);
    expect(scheduler.start()).toBeNull();
  });

  it("should_not_start_when_cron_expression_invalid", () => {
    const deps = makeDeps([]);
    const logs: string[] = [];
    const scheduler = createRefreshScheduler({ ...deps, log: (m) => logs.push(m) });
    expect(scheduler.start("not a cron")).toBeNull();
    expect(logs.join("\n")).toContain("TWIN_REFRESH_CRON 无效");
  });

  it("should_start_when_cron_expression_valid", () => {
    const deps = makeDeps([]);
    const scheduler = createRefreshScheduler(deps);
    const task = scheduler.start("0 2 * * *");
    expect(task).not.toBeNull();
    scheduler.stop();
  });

  it("should_run_round_when_scheduled_time_reaches", async () => {
    const enqueued: string[] = [];
    const deps = makeDeps([twinWith("hcp_a", "2026-10-01T00:00:00.000Z")], {
      enqueueAndWait: async (hcpId) => {
        enqueued.push(hcpId);
        return "done";
      },
    });
    const scheduler = createRefreshScheduler(deps);
    scheduler.start("0 2 * * *");
    const scheduleMock = vi.mocked(cron.schedule);
    expect(scheduleMock).toHaveBeenCalledWith("0 2 * * *", expect.any(Function));
    const fire = scheduleMock.mock.calls.at(-1)![1] as () => void;
    fire();
    await vi.waitFor(() => expect(enqueued).toEqual(["hcp_a"]));
    scheduler.stop();
  });

  it("should_refresh_due_hcp_and_skip_ttl_fresh_hcp", async () => {
    const old = twinWith("hcp_old", "2026-10-01T02:00:00.000Z"); // 19 天前 → 到期
    const fresh = twinWith("hcp_fresh", new Date(NOW.getTime() - 3_600_000).toISOString()); // 1h 前 → 跳过
    const neverBuilt = twinWith("hcp_new", undefined); // 从未 build（add_hcp 身份分身）→ 到期
    const enqueued: string[] = [];
    const deps = makeDeps([old, fresh, neverBuilt], {
      enqueueAndWait: async (hcpId) => {
        enqueued.push(hcpId);
        return "done";
      },
    });

    const r = await createRefreshScheduler(deps).runOnce();

    expect(enqueued).toEqual(["hcp_old", "hcp_new"]);
    expect(r.due).toBe(2);
    expect(r.refreshed).toEqual(["hcp_old", "hcp_new"]);
    expect(r.skipped_ttl).toEqual(["hcp_fresh"]);
    expect(r.failed).toEqual([]);
  });

  it("should_exclude_agent_general_placeholder", async () => {
    const normal = twinWith("hcp_a", "2026-10-01T00:00:00.000Z");
    const placeholder = twinWith("_agent_general", "2026-10-01T00:00:00.000Z");
    const enqueued: string[] = [];
    const deps = makeDeps([normal, placeholder], {
      enqueueAndWait: async (hcpId) => {
        enqueued.push(hcpId);
        return "done";
      },
    });

    const r = await createRefreshScheduler(deps).runOnce();

    expect(enqueued).toEqual(["hcp_a"]);
    expect(r.due).toBe(1);
  });

  it("should_continue_round_when_single_hcp_fails", async () => {
    const a = twinWith("hcp_a", "2026-10-01T00:00:00.000Z");
    const b = twinWith("hcp_b", "2026-10-01T00:00:00.000Z");
    const logs: string[] = [];
    const deps = makeDeps([a, b], {
      enqueueAndWait: async (hcpId) => (hcpId === "hcp_a" ? "failed" : "done"),
      log: (m) => logs.push(m),
    });

    const r = await createRefreshScheduler(deps).runOnce();

    expect(r.refreshed).toEqual(["hcp_b"]);
    expect(r.failed).toEqual(["hcp_a"]);
    expect(logs.join("\n")).toContain("刷新失败 hcp_a");
  });

  it("should_report_active_run_as_skipped_not_failed", async () => {
    const a = twinWith("hcp_a", "2026-10-01T00:00:00.000Z");
    const deps = makeDeps([a], {
      enqueueAndWait: async () => "active",
    });

    const r = await createRefreshScheduler(deps).runOnce();

    expect(r.skipped_active).toEqual(["hcp_a"]);
    expect(r.failed).toEqual([]);
  });

  it("should_abort_round_when_list_fails", async () => {
    const logs: string[] = [];
    const deps = makeDeps([twinWith("hcp_a", "2026-10-01T00:00:00.000Z")], {
      listHcpIds: async () => {
        throw new Error("DB down");
      },
      enqueueAndWait: async () => {
        throw new Error("不应触发");
      },
      log: (m) => logs.push(m),
    });

    const r = await createRefreshScheduler(deps).runOnce();

    expect(r).toEqual({
      due: 0,
      refreshed: [],
      skipped_ttl: [],
      skipped_active: [],
      failed: [],
    });
    expect(logs.join("\n")).toContain("本轮中止");
  });

  it("should_treat_enqueue_throw_as_failed_not_crash", async () => {
    const a = twinWith("hcp_a", "2026-10-01T00:00:00.000Z");
    const deps = makeDeps([a], {
      enqueueAndWait: async () => {
        throw new Error("enqueue exploded");
      },
    });

    const r = await createRefreshScheduler(deps).runOnce();

    expect(r.failed).toEqual(["hcp_a"]);
  });
});
