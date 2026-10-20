import { describe, expect, it, vi } from "vitest";
import { BuildQueue } from "./queue.js";

describe("BuildQueue onBuildComplete 钩子（ADR-013）", () => {
  it("should_call_hook_once_when_run_succeeds", async () => {
    const onBuildComplete = vi.fn().mockResolvedValue(undefined);
    const q = new BuildQueue(async () => {}, { onBuildComplete });
    const enq = q.enqueue("hcp_a", "full");
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;
    await q.waitFinished(enq.runId);
    expect(onBuildComplete).toHaveBeenCalledTimes(1);
    expect(onBuildComplete).toHaveBeenCalledWith("hcp_a", enq.runId);
    expect(q.getStatus(enq.runId)?.phase).toBe("done");
  });

  it("should_not_call_hook_when_run_fails", async () => {
    const onBuildComplete = vi.fn();
    const q = new BuildQueue(
      async () => {
        throw new Error("Stage C 失败");
      },
      { onBuildComplete },
    );
    const enq = q.enqueue("hcp_a", "full");
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;
    await q.waitFinished(enq.runId);
    expect(onBuildComplete).not.toHaveBeenCalled();
    expect(q.getStatus(enq.runId)?.phase).toBe("error");
  });

  it("should_keep_done_status_when_hook_throws", async () => {
    const onBuildComplete = vi.fn().mockRejectedValue(new Error("LLM 不可用"));
    const q = new BuildQueue(async () => {}, { onBuildComplete });
    const enq = q.enqueue("hcp_a", "full");
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;
    await q.waitFinished(enq.runId);
    expect(q.getStatus(enq.runId)?.phase).toBe("done");
  });

  it("should_resolve_waitFinished_immediately_for_unknown_or_finished_run", async () => {
    const q = new BuildQueue(async () => {});
    await expect(q.waitFinished("run_unknown")).resolves.toBeUndefined();
    const enq = q.enqueue("hcp_a", "full");
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;
    await q.waitFinished(enq.runId);
    await expect(q.waitFinished(enq.runId)).resolves.toBeUndefined();
  });

  it("should_await_hook_before_wait_finished_resolves", async () => {
    let hookDone = false;
    const q = new BuildQueue(async () => {}, {
      onBuildComplete: async () => {
        await new Promise((r) => setTimeout(r, 20));
        hookDone = true;
      },
    });
    const enq = q.enqueue("hcp_a", "full");
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;
    await q.waitFinished(enq.runId);
    expect(hookDone).toBe(true);
  });
});
