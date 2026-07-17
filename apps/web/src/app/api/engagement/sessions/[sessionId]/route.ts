import { getChatSession } from "@hca/db";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import { agentHttpError } from "@/lib/agent-error";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  loadRootEnv();
  const { sessionId } = await ctx.params;
  if (!sessionId) {
    return jsonError(
      { code: "VALIDATION_ERROR", message: "缺少 sessionId" },
      400,
    );
  }
  try {
    const session = await getChatSession(decodeURIComponent(sessionId));
    if (!session) {
      return jsonError(
        { code: "OPTIONS_NOT_FOUND", message: "会话不存在" },
        404,
      );
    }
    return jsonOk({ session });
  } catch (err) {
    return agentHttpError(err);
  }
}
