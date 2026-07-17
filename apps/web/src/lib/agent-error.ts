import { jsonError } from "@/lib/api";

export function agentHttpError(err: unknown) {
  const e = err as {
    code?: string;
    message?: string;
    repair_hint?: string;
    details?: unknown;
  };
  if (e?.code) {
    const status =
      e.code === "VALIDATION_ERROR" ||
      e.code === "DOING_NOW_INPUT_INSUFFICIENT" ||
      e.code === "CHAT_MODE_MISMATCH"
        ? 400
        : e.code === "INSIGHTS_NOT_FOUND" || e.code === "OPTIONS_NOT_FOUND"
          ? 404
          : e.code === "COMPLIANCE_REJECTED"
            ? 422
            : 502;
    return jsonError(
      {
        code: e.code,
        message: e.message ?? "Agent 调用失败",
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
    },
    502,
  );
}
