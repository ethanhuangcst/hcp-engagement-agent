import { z } from "zod";

export const EngagementRefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: z.string().optional(),
  score: z.number().optional(),
});

export type EngagementRef = z.infer<typeof EngagementRefSchema>;

export const EngagementOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  action: z.string().min(1),
  owner: z.string().min(1),
  channel: z.string().min(1),
  theme: z.string().min(1),
  success_signal: z.string().min(1),
  compliance_note: z.string().min(1),
  priority: z.enum(["P0", "P1", "P2"]),
  academic_refs: z.array(EngagementRefSchema).default([]),
  compliance_refs: z.array(EngagementRefSchema).default([]),
});

export type EngagementOption = z.infer<typeof EngagementOptionSchema>;

export const GateStatusSchema = z.enum([
  "pass",
  "conditional",
  "reject",
  "idle",
]);

export type GateStatus = z.infer<typeof GateStatusSchema>;

export const GateFindingSchema = z.object({
  severity: z.enum(["high", "medium", "low"]),
  rule: z.string().min(1),
  detail: z.string().min(1),
  disposition: z.string().optional(),
});

export type GateFinding = z.infer<typeof GateFindingSchema>;

export const GateResultSchema = z.object({
  status: z.enum(["pass", "conditional", "reject"]),
  findings: z.array(GateFindingSchema).default([]),
  must_keep_notes: z.array(z.string()).default([]),
  pending_human: z.array(z.string()).default([]),
  as_of: z.string(),
  disclaimer: z
    .string()
    .default("辅助闸门，不替代正式 MLR（医学/法务/注册法规）签批"),
});

export type GateResult = z.infer<typeof GateResultSchema>;

export const EngagementOptionsRunSchema = z.object({
  run_id: z.string().min(1),
  hcp_id: z.string().min(1),
  /** Narrative language of this run; omit on legacy → treat as zh-CN. */
  locale: z.enum(["zh-CN", "en"]).optional(),
  options: z.array(EngagementOptionSchema).min(3).max(5),
  gate_result: GateResultSchema.optional(),
  as_of: z.string(),
  llm: z
    .object({
      provider: z.string().min(1),
      model: z.string().min(1),
    })
    .optional(),
  meta: z
    .object({
      academic_hit_count: z.number().int().nonnegative().optional(),
      compliance_hit_count: z.number().int().nonnegative().optional(),
      product_context: z.string().optional(),
    })
    .optional(),
});

export type EngagementOptionsRun = z.infer<typeof EngagementOptionsRunSchema>;

export const ChatModeSchema = z.enum(["open_chat", "revise_options"]);
export type ChatMode = z.infer<typeof ChatModeSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1),
        mime: z.string().optional(),
        summary: z.string().optional(),
      }),
    )
    .optional(),
  created_at: z.string().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatSessionSchema = z.object({
  session_id: z.string().min(1),
  hcp_id: z.string().min(1),
  mode: ChatModeSchema,
  option_run_id: z.string().optional(),
  option_id: z.string().optional(),
  title: z.string().optional(),
  messages: z.array(ChatMessageSchema).default([]),
  as_of: z.string(),
  llm: z
    .object({
      provider: z.string().min(1),
      model: z.string().min(1),
    })
    .optional(),
});

export type ChatSession = z.infer<typeof ChatSessionSchema>;
