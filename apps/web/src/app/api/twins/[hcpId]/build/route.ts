import { z } from "zod";
import { getMcp } from "@/lib/mcp";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import { rememberBuildRun } from "@/lib/build-runs";

const BodySchema = z.object({
  mode: z.enum(["full", "incremental"]).optional(),
});

type Ctx = { params: Promise<{ hcpId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  loadRootEnv();
  const { hcpId: rawId } = await ctx.params;
  const hcpId = decodeURIComponent(rawId);
  let mode: "full" | "incremental" = "full";
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (parsed.success && parsed.data.mode) mode = parsed.data.mode;
  } catch {
    /* empty body ok */
  }

  try {
    const result = await getMcp().buildTwin({ hcpId, mode });
    if (!result.ok) {
      return jsonError(
        (result.error as { code?: string; message?: string }) ?? {
          code: "INTERNAL_ERROR",
          message: "build_twin 失败",
        },
        400,
      );
    }
    const data = result.data as { runId?: string };
    if (!data?.runId) {
      return jsonError(
        { code: "INTERNAL_ERROR", message: "build_twin 未返回 runId" },
        502,
      );
    }
    rememberBuildRun(hcpId, data.runId);
    return jsonOk({ runId: data.runId, hcpId });
  } catch (err) {
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        repair_hint: "确认 hcp-twin-mcp 已以 TWIN_MODE=live 启动",
      },
      502,
    );
  }
}
