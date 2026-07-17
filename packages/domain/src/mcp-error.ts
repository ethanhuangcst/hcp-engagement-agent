import { z } from "zod";

export const McpErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "UNRESOLVED_IDENTITY",
  "AUTHOR_IDS_REQUIRED",
  "BUILD_IN_PROGRESS",
  "SOURCE_UNAVAILABLE",
  "RATE_LIMITED",
  "COMPLIANCE_BLOCKED",
  "INTERNAL_ERROR",
]);

export type McpErrorCode = z.infer<typeof McpErrorCodeSchema>;

export const McpErrorSchema = z.object({
  code: McpErrorCodeSchema,
  message: z.string(),
  repair_hint: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),
});

export type McpError = z.infer<typeof McpErrorSchema>;

export function mcpError(
  code: McpErrorCode,
  message: string,
  opts?: {
    repair_hint?: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  },
): McpError {
  const retryableDefault =
    code === "SOURCE_UNAVAILABLE" ||
    code === "RATE_LIMITED" ||
    code === "BUILD_IN_PROGRESS";
  return {
    code,
    message,
    repair_hint: opts?.repair_hint,
    details: opts?.details,
    retryable: opts?.retryable ?? retryableDefault,
  };
}

export function isMcpError(value: unknown): value is McpError {
  return McpErrorSchema.safeParse(value).success;
}
