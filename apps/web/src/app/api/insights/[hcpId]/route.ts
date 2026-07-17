import { getInsights } from "@hca/db";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";

type Ctx = { params: Promise<{ hcpId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  loadRootEnv();
  const { hcpId } = await ctx.params;
  const insights = await getInsights(hcpId);
  if (!insights) {
    return jsonError(
      { code: "NOT_FOUND", message: `未找到 Insights: ${hcpId}` },
      404,
    );
  }
  return jsonOk({ insights });
}
