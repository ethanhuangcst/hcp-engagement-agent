import { z } from "zod";
import { getMcp } from "@/lib/mcp";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";

const Schema = z.object({
  name: z.string().min(1),
  hospital: z.string().min(1),
  dept: z.string().min(1),
  city: z.string().optional(),
});

export async function POST(req: Request) {
  loadRootEnv();
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      {
        code: "VALIDATION_ERROR",
        message: "请填写姓名、医院、科室",
        details: { issues: parsed.error.issues },
        repair_hint: "补全查询锚点后再试",
      },
      400,
    );
  }
  try {
    const result = await getMcp().resolveHcpIdentity(parsed.data);
    if (!result.ok) return jsonError(result.error, 400);
    return jsonOk(result.data);
  } catch (err) {
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        repair_hint: "确认 hcp-twin-mcp 已在 MCP_URL 启动",
      },
      502,
    );
  }
}
