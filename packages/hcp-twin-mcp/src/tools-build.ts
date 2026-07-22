import { z } from "zod";
import { mcpError, type McpError } from "@hca/domain";
import type { TwinStore } from "./store.js";
import { createBuildQueue, type PipelineDeps } from "./build/pipeline.js";
import type { BuildQueue } from "./build/queue.js";
import { collectHeatmapLive } from "./collectors/heatmap.js";
import { createHttpClient } from "./collectors/http.js";
import { ruleTagFromProfile } from "./tagging.js";

export type ToolOk<T> = { ok: true; data: T };
export type ToolFail = { ok: false; error: McpError };
export type ToolResult<T> = ToolOk<T> | ToolFail;

function validationFail(err: z.ZodError): ToolFail {
  return {
    ok: false,
    error: mcpError("VALIDATION_ERROR", "入参校验失败", {
      details: { issues: err.issues.map((i) => ({ path: i.path, message: i.message })) },
    }),
  };
}

export const BuildTwinInputSchema = z.object({
  hcpId: z.string().min(1),
  mode: z.enum(["full", "incremental"]).default("full"),
});

export const GetTwinStatusInputSchema = z.object({
  runId: z.string().min(1),
});

export const PollHeatmapInputSchema = z.object({
  hcpId: z.string().min(1),
});

let sharedQueue: BuildQueue | null = null;

export function getOrCreateBuildQueue(deps: PipelineDeps): BuildQueue {
  if (!sharedQueue) {
    sharedQueue = createBuildQueue(deps);
  }
  return sharedQueue;
}

/** 测试用：重置队列单例 */
export function resetBuildQueueForTests(): void {
  sharedQueue = null;
}

export async function buildTwinTool(
  store: TwinStore,
  raw: unknown,
  deps?: Partial<PipelineDeps>,
): Promise<ToolResult<{ runId: string }>> {
  const parsed = BuildTwinInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const twin = await store.getTwin(parsed.data.hcpId);
  if (!twin) {
    return {
      ok: false,
      error: mcpError("NOT_FOUND", `未找到 Twin: ${parsed.data.hcpId}`, {
        repair_hint: "先 confirm_and_save_twin 再 build_twin",
      }),
    };
  }

  const queue = getOrCreateBuildQueue({
    store,
    http: deps?.http,
  });
  const enq = queue.enqueue(parsed.data.hcpId, parsed.data.mode);
  if (!enq.ok) {
    return {
      ok: false,
      error: mcpError("BUILD_IN_PROGRESS", "同一分身已有进行中的构建", {
        repair_hint: `等待或查询 get_twin_status(${enq.activeRunId})`,
        details: { activeRunId: enq.activeRunId },
      }),
    };
  }
  return { ok: true, data: { runId: enq.runId } };
}

export async function getTwinStatusTool(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<unknown>> {
  const parsed = GetTwinStatusInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const queue = getOrCreateBuildQueue({ store });
  const status = queue.getStatus(parsed.data.runId);
  if (!status) {
    return {
      ok: false,
      error: mcpError("NOT_FOUND", `未知 runId: ${parsed.data.runId}`, {
        repair_hint: "使用 build_twin 返回的 runId",
      }),
    };
  }
  return { ok: true, data: status };
}

/** F-MCP-028：热力监控水位刷新（live CT.gov），写 last_polled_at */
export async function pollHeatmapTool(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<{ hcpId: string; last_polled_at: string; event_count: number }>> {
  const parsed = PollHeatmapInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const twin = await store.getTwin(parsed.data.hcpId);
  if (!twin) {
    return {
      ok: false,
      error: mcpError("NOT_FOUND", `未找到 Twin: ${parsed.data.hcpId}`),
    };
  }
  const http = createHttpClient();
  const activity = await collectHeatmapLive(http, {
    name_zh: twin.profile.name_zh,
    name_en: twin.profile.name_en,
  });
  const next = {
    ...twin,
    activity: {
      ...(typeof twin.activity === "object" && twin.activity ? twin.activity : {}),
      events: activity.events,
      windows: activity.windows,
      last_polled_at: activity.last_polled_at,
      trials: activity.trials,
    },
  };
  await store.upsertTwin(next);
  return {
    ok: true,
    data: {
      hcpId: parsed.data.hcpId,
      last_polled_at: activity.last_polled_at,
      event_count: activity.events.length,
    },
  };
}

/** F-MCP-029 显式入口：职业后重打标 */
export async function retagAfterCareerTool(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<{ tags: unknown }>> {
  const parsed = z.object({ hcpId: z.string().min(1) }).safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const twin = await store.getTwin(parsed.data.hcpId);
  if (!twin) {
    return {
      ok: false,
      error: mcpError("NOT_FOUND", `未找到 Twin: ${parsed.data.hcpId}`),
    };
  }
  if (twin.profile.tags?.tag_method === "user_override") {
    return { ok: true, data: { tags: twin.profile.tags } };
  }
  const tags = {
    ...ruleTagFromProfile({
      title: twin.profile.title,
      hospital: twin.profile.hospital,
      roleHints: twin.profile.role_labels ?? [],
    }),
    tag_as_of: new Date().toISOString().slice(0, 10),
  };
  const updated = await store.updateTags(parsed.data.hcpId, tags);
  return { ok: true, data: { tags: updated?.profile.tags ?? tags } };
}

export function resourceSlice(
  twin: Awaited<ReturnType<TwinStore["getTwin"]>>,
  kind: "career" | "research" | "heatmap",
): unknown {
  if (!twin) return null;
  if (kind === "career") return twin.career ?? { empty: true };
  if (kind === "research") return twin.research ?? { empty: true };
  return twin.activity ?? { empty: true, no_public_evidence: true };
}
