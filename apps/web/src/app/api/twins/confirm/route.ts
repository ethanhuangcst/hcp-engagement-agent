import { z } from "zod";
import { getMcp } from "@/lib/mcp";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";

const Schema = z.object({
  hcpId: z.string().min(1),
  name_zh: z.string().min(1).optional(),
  name_en: z.string().nullable().optional(),
  hospital: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  city: z.string().optional(),
  author_ids_draft: z
    .record(z.string(), z.string().nullable().optional())
    .optional(),
  tags_draft: z
    .object({
      hcp_tier: z.string().optional(),
      role_tags: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  loadRootEnv();
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      { code: "VALIDATION_ERROR", message: "缺少 hcpId" },
      400,
    );
  }
  try {
    const result = await getMcp().confirmAndSaveTwin(parsed.data);
    if (!result.ok) return jsonError(result.error, 400);
    // MVP-1：确认仅落库身份；build_twin 由详情显式触发，禁止此处 stub runId。
    return jsonOk(result.data as object);
  } catch (err) {
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        repair_hint: "确认 hcp-twin-mcp 已启动且 DATABASE_URL 可达",
      },
      502,
    );
  }
}
