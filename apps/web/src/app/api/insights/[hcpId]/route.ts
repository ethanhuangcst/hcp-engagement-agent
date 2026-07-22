import { getInsights, getTwin } from "@hca/db";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";

type Ctx = { params: Promise<{ hcpId: string }> };

/**
 * F-WEB-037：读 Insights；附带 Twin 切片供洞察八块同源渲染（科研/热力/文献号）。
 */
export async function GET(_req: Request, ctx: Ctx) {
  loadRootEnv();
  const { hcpId: rawId } = await ctx.params;
  const hcpId = decodeURIComponent(rawId);
  try {
    const [insights, twin] = await Promise.all([
      getInsights(hcpId),
      getTwin(hcpId),
    ]);
    if (!twin && !insights) {
      return jsonError(
        { code: "NOT_FOUND", message: `未找到 Twin/Insights: ${hcpId}` },
        404,
      );
    }
    if (!twin) {
      return jsonError(
        { code: "NOT_FOUND", message: `未找到 Twin: ${hcpId}` },
        404,
      );
    }
    return jsonOk({
      twin,
      insights: insights ?? null,
    });
  } catch (err) {
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        repair_hint: "确认 DATABASE_URL 为 mysql://… 且实例可达（见 specs/9.deploy.md）",
      },
      502,
    );
  }
}
