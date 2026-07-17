import { z } from "zod";

export const AgentErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "INSIGHTS_NOT_FOUND",
  "DOING_NOW_INPUT_INSUFFICIENT",
  "LLM_CONFIG_INVALID",
  "LLM_AUTH_FAILED",
  "LLM_TIMEOUT",
  "LLM_RATE_LIMITED",
  "LLM_ERROR",
  "INTERNAL_ERROR",
]);

export type AgentErrorCode = z.infer<typeof AgentErrorCodeSchema>;

export const AgentErrorSchema = z.object({
  code: AgentErrorCodeSchema,
  message: z.string(),
  repair_hint: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),
});

export type AgentError = z.infer<typeof AgentErrorSchema>;

export function agentError(
  code: AgentErrorCode,
  message: string,
  opts?: {
    repair_hint?: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  },
): AgentError {
  const retryableDefault =
    code === "LLM_TIMEOUT" ||
    code === "LLM_RATE_LIMITED" ||
    code === "LLM_ERROR";
  return {
    code,
    message,
    repair_hint: opts?.repair_hint,
    details: opts?.details,
    retryable: opts?.retryable ?? retryableDefault,
  };
}

export const SynthesizeDoingNowInputSchema = z.object({
  hcpId: z.string().min(1),
  refresh: z.boolean().optional(),
});

export type SynthesizeDoingNowInput = z.infer<
  typeof SynthesizeDoingNowInputSchema
>;

export const LlmChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export type LlmChatMessage = z.infer<typeof LlmChatMessageSchema>;

export type LlmChatResult = {
  content: string;
  provider: string;
  model: string;
};
