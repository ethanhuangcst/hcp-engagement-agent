import { z } from "zod";
import { getLatestEngagementOptions } from "@hca/db";
import { proposeOptions } from "@hca/hcp-engagement-agent";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import { agentHttpError } from "@/lib/agent-error";

const PostBodySchema = z.object({
  hcpId: z.string().min(1),
  tenantId: z.string().optional(),
  productContext: z.string().optional(),
});

/** GET ?hcpId= — 最新一人一策 */
export async function GET(req: Request) {
  loadRootEnv();
  const hcpId = new URL(req.url).searchParams.get("hcpId")?.trim();
  if (!hcpId) {
    return jsonError(
      { code: "VALIDATION_ERROR", message: "缺少 hcpId" },
      400,
    );
  }
  try {
    const run = await getLatestEngagementOptions(hcpId);
    if (!run) {
      return jsonOk({ run: null, options: [] });
    }
    return jsonOk({
      runId: run.run_id,
      run,
      options: run.options,
      gate_result: run.gate_result ?? null,
    });
  } catch (err) {
    return agentHttpError(err);
  }
}

/** POST — I-AGT-002 / F-WEB-027 生成方案 */
export async function POST(req: Request) {
  loadRootEnv();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(
      { code: "VALIDATION_ERROR", message: "请求体须为 JSON" },
      400,
    );
  }
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      {
        code: "VALIDATION_ERROR",
        message: "缺少 hcpId",
        details: { issues: parsed.error.issues },
      },
      400,
    );
  }
  try {
    const result = await proposeOptions(parsed.data);
    return jsonOk({
      runId: result.runId,
      options: result.options,
      gate_result: result.gate_result ?? null,
      run: result.run,
    });
  } catch (err) {
    return agentHttpError(err);
  }
}
