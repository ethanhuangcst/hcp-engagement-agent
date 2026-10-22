import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * DEF-007 / MKB2-05（rag-design §21 启动序契约）回归测试：
 * seed-compliance 必须先 ensureDualCollectionsWithProbe 再 health 探测，
 * 预检只探测「已确保存在」的对象；预检不过以非零码退出且不 seed。
 * mock 只落在依赖边界（../api.js、@hca/db），不 mock 业务实现。
 */
const calls = vi.hoisted(() => [] as string[]);
const state = vi.hoisted(() => ({ healthOk: true }));

vi.mock("@hca/db", () => ({
  loadRootEnv: vi.fn(() => undefined),
}));

vi.mock("../api.js", () => ({
  health: vi.fn(async () => {
    calls.push("health");
    return {
      ok: state.healthOk,
      qdrant: state.healthOk,
      collections: state.healthOk
        ? ["academic_index", "compliance_index"]
        : [],
      bind_safe: true,
    };
  }),
  ensureDualCollectionsWithProbe: vi.fn(async () => {
    calls.push("ensure");
  }),
  seedCompliance: vi.fn(async () => {
    calls.push("seed");
    return { seeded: 23 };
  }),
}));

const exitSpy = vi
  .spyOn(process, "exit")
  .mockImplementation((() => undefined) as never);
vi.spyOn(process, "chdir").mockImplementation((() => undefined) as never);

describe("DEF-007 seed-compliance 启动序（MKB2-05）", () => {
  beforeEach(() => {
    vi.resetModules();
    calls.length = 0;
    exitSpy.mockClear();
    state.healthOk = true;
  });

  it("should_ensure_collections_before_health_probe_and_seed_when_empty_db", async () => {
    const mod = await import("./seed-compliance.js");
    await mod.mainPromise;
    expect(calls).toEqual(["ensure", "health", "seed", "health"]);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("should_exit_nonzero_without_seeding_when_health_fails_after_ensure", async () => {
    state.healthOk = false;
    const mod = await import("./seed-compliance.js");
    await mod.mainPromise;
    expect(calls).toEqual(["ensure", "health"]);
    expect(calls).not.toContain("seed");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});