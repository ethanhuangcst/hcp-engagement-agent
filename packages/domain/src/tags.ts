import { z } from "zod";

export const HcpTierSchema = z.enum(["T1", "T2", "T3", "unclassified"]);
export type HcpTier = z.infer<typeof HcpTierSchema>;

export const RoleTagSchema = z.enum([
  "kol",
  "kme",
  "administrator",
  "policy_voice",
  "frontline",
  "speaker",
  "investigator",
  "guideline_author",
]);
export type RoleTag = z.infer<typeof RoleTagSchema>;

export const TagMethodSchema = z.enum(["rule", "llm_assisted", "user_override"]);
export type TagMethod = z.infer<typeof TagMethodSchema>;

export const HcpTagsSchema = z.object({
  hcp_tier: HcpTierSchema,
  role_tags: z.array(RoleTagSchema).default([]),
  tag_confidence: z.enum(["high", "medium", "low"]).optional(),
  tag_as_of: z.string().optional(),
  tag_method: TagMethodSchema.optional(),
  evidence_refs: z.array(z.string()).optional(),
});

export type HcpTags = z.infer<typeof HcpTagsSchema>;

/** Forbidden tag signals (compliance). */
export const FORBIDDEN_TAG_SIGNALS = [
  "处方潜力",
  "统方",
  "销量潜力",
  "进院意愿",
] as const;
