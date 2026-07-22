import { z } from "zod";

export const AgentErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "INSIGHTS_NOT_FOUND",
  "DOING_NOW_INPUT_INSUFFICIENT",
  "COMPLIANCE_RETRIEVAL_EMPTY",
  "COMPLIANCE_REJECTED",
  "RAG_UNAVAILABLE",
  "CHAT_MODE_MISMATCH",
  "OPTIONS_NOT_FOUND",
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
    code === "LLM_ERROR" ||
    code === "RAG_UNAVAILABLE";
  return {
    code,
    message,
    repair_hint: opts?.repair_hint,
    details: opts?.details,
    retryable: opts?.retryable ?? retryableDefault,
  };
}

/** UI / narrative locale for LLM + rule generation. */
export const LocaleSchema = z.enum(["zh-CN", "en"]).default("zh-CN");
export type AgentLocale = z.infer<typeof LocaleSchema>;

export const SynthesizeDoingNowInputSchema = z.object({
  hcpId: z.string().min(1),
  refresh: z.boolean().optional(),
  locale: LocaleSchema.optional(),
});

export type SynthesizeDoingNowInput = z.infer<
  typeof SynthesizeDoingNowInputSchema
>;

export const ProposeOptionsInputSchema = z.object({
  hcpId: z.string().min(1),
  tenantId: z.string().optional(),
  productContext: z.string().optional(),
  locale: LocaleSchema.optional(),
});

export type ProposeOptionsInput = z.infer<typeof ProposeOptionsInputSchema>;

export const ChatAttachmentSchema = z.object({
  name: z.string().min(1),
  mime: z.string().optional(),
  summary: z.string().optional(),
});

/** open_chat：hcpId 可选（通用 Agent）；revise_options：hcpId 必填 */
export const ChatInputSchema = z
  .object({
    mode: z.enum(["open_chat", "revise_options"]),
    sessionId: z.string().min(1).optional(),
    hcpId: z.string().min(1).optional(),
    message: z.string().min(1),
    optionRunId: z.string().min(1).optional(),
    optionId: z.string().min(1).optional(),
    attachments: z.array(ChatAttachmentSchema).optional(),
    locale: LocaleSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "revise_options" && !v.hcpId) {
      ctx.addIssue({
        code: "custom",
        message: "revise_options 须提供 hcpId",
        path: ["hcpId"],
      });
    }
    if (v.mode === "revise_options" && !v.optionRunId) {
      ctx.addIssue({
        code: "custom",
        message: "revise_options 须提供 optionRunId",
        path: ["optionRunId"],
      });
    }
  });

export type ChatInput = z.infer<typeof ChatInputSchema>;

/** @deprecated 请用 `@hca/db` 的同名常量；此处再导出以保持包 API 稳定 */
export { AGENT_GENERAL_HCP_ID } from "@hca/db";

export const RunComplianceGateInputSchema = z.object({
  hcpId: z.string().min(1),
  optionRunId: z.string().min(1),
  optionId: z.string().min(1).optional(),
});

export type RunComplianceGateInput = z.infer<
  typeof RunComplianceGateInputSchema
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
