import { z } from "zod";
import { synthesizeDoingNow } from "@hca/hcp-engagement-agent";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";

const BodySchema = z.object({
  hcpId: z.string().min(1),
  refresh: z.boolean().optional(),
  locale: z.enum(["zh-CN", "en"]).optional(),
});

/** I-AGT-001 / F-WEB-018：合成或刷新一句话洞察（与列表/详情同源） */
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
        message: "缺少 hcpId",
        details: { issues: parsed.error.issues },
      },
      400,
    );
  }

  try {
    const result = await synthesizeDoingNow(parsed.data);
    return jsonOk({
      doing_now: result.doing_now,
      reused: result.reused,
    });
  } catch (err) {
    const e = err as {
      code?: string;
      message?: string;
      repair_hint?: string;
      details?: unknown;
    };
    if (e?.code) {
      const status =
        e.code === "VALIDATION_ERROR" ||
        e.code === "DOING_NOW_INPUT_INSUFFICIENT"
          ? 400
          : e.code === "INSIGHTS_NOT_FOUND"
            ? 404
            : 502;
      return jsonError(
        {
          code: e.code,
          message: e.message ?? "synthesizeDoingNow 失败",
          repair_hint: e.repair_hint,
          details: e.details as Record<string, unknown> | undefined,
        },
        status,
      );
    }
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        repair_hint:
          "确认 DATABASE_URL；无 Key 时用规则合成（勿设 LLM_STRICT=true）",
      },
      502,
    );
  }
}
