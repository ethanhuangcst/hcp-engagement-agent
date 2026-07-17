import { z } from "zod";
import { runComplianceGate } from "@hca/hcp-engagement-agent";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import { agentHttpError } from "@/lib/agent-error";

const BodySchema = z.object({
  hcpId: z.string().min(1),
  optionRunId: z.string().min(1),
  optionId: z.string().optional(),
});

/** POST — I-AGT-004 / F-WEB-028 送合规闸门 */
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
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      {
        code: "VALIDATION_ERROR",
        message: "缺少 hcpId 或 optionRunId",
        details: { issues: parsed.error.issues },
      },
      400,
    );
  }
  try {
    const result = await runComplianceGate(parsed.data);
    return jsonOk({
      status: result.status,
      findings: result.findings,
      gate_result: result.gate_result,
      run: result.run,
      options: result.run.options,
    });
  } catch (err) {
    return agentHttpError(err);
  }
}
