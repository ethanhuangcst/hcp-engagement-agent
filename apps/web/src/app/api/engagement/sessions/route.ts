import { z } from "zod";
import { listChatSessions } from "@hca/db";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import { agentHttpError } from "@/lib/agent-error";

const QuerySchema = z.object({
  hcpId: z.string().min(1),
  mode: z.enum(["open_chat", "revise_options"]).optional(),
});

/** GET ?hcpId=&mode= — 会话历史列表 */
export async function GET(req: Request) {
  loadRootEnv();
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    hcpId: url.searchParams.get("hcpId") ?? undefined,
    mode: url.searchParams.get("mode") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(
      { code: "VALIDATION_ERROR", message: "缺少 hcpId" },
      400,
    );
  }
  try {
    const sessions = await listChatSessions(
      parsed.data.hcpId,
      parsed.data.mode,
    );
    return jsonOk({
      sessions: sessions.map((s) => ({
        sessionId: s.session_id,
        hcpId: s.hcp_id,
        mode: s.mode,
        title: s.title,
        optionRunId: s.option_run_id,
        messageCount: s.messages.length,
        asOf: s.as_of,
        preview: s.messages[s.messages.length - 1]?.content?.slice(0, 80),
      })),
    });
  } catch (err) {
    return agentHttpError(err);
  }
}
