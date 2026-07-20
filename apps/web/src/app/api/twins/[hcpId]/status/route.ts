import { getMcp } from "@/lib/mcp";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import { getRememberedRunId } from "@/lib/build-runs";

type Ctx = { params: Promise<{ hcpId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  loadRootEnv();
  const { hcpId: rawId } = await ctx.params;
  const hcpId = decodeURIComponent(rawId);
  const url = new URL(req.url);
  const runId =
    url.searchParams.get("runId") ?? getRememberedRunId(hcpId);

  if (!runId) {
    return jsonError(
      {
        code: "NOT_FOUND",
        message: "尚无构建进度",
        repair_hint: "在 HCP资料「智能体情报构建」区点击「构建情报」触发 build_twin",
      },
      404,
    );
  }

  try {
    const result = await getMcp().getTwinStatus(runId);
    if (!result.ok) {
      return jsonError(
        (result.error as { code?: string; message?: string }) ?? {
          code: "NOT_FOUND",
          message: "未知 runId",
        },
        404,
      );
    }
    return jsonOk(result.data as object);
  } catch (err) {
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        repair_hint: "确认 hcp-twin-mcp 已启动",
      },
      502,
    );
  }
}
