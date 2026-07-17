import { z } from "zod";
import { chat } from "@hca/hcp-engagement-agent";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import { agentHttpError } from "@/lib/agent-error";

const BodySchema = z.object({
  mode: z.enum(["open_chat", "revise_options"]),
  sessionId: z.string().optional(),
  hcpId: z.string().min(1),
  message: z.string().min(1),
  optionRunId: z.string().optional(),
  optionId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1),
        mime: z.string().optional(),
        summary: z.string().optional(),
      }),
    )
    .optional(),
});

/** POST — I-AGT-003 / F-WEB-029 · F-WEB-030 */
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
        message: "chat 入参无效",
        details: { issues: parsed.error.issues },
      },
      400,
    );
  }
  try {
    const result = await chat(parsed.data);
    return jsonOk(result);
  } catch (err) {
    return agentHttpError(err);
  }
}
