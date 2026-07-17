import { z } from "zod";
import { AuthorIdsSchema, hasActiveP0AuthorId } from "./author-ids.js";
import { HcpTagsSchema } from "./tags.js";

export const SCHEMA_VERSION = "0.1.5-p0";

export const DisambiguationStatusSchema = z.enum([
  "resolved",
  "ambiguous",
  "unresolved",
]);

export const TwinIdentitySchema = z.object({
  name_zh: z.string().min(1),
  name_en: z.string().optional(),
  hospital: z.string().min(1),
  department: z.string().min(1),
  city: z.string().optional(),
  title: z.string().optional(),
});

export type TwinIdentity = z.infer<typeof TwinIdentitySchema>;

export const TwinProfileSchema = z.object({
  name_zh: z.string().min(1),
  name_en: z.string().optional(),
  hospital: z.string().min(1),
  department: z.string().min(1),
  city: z.string().optional(),
  title: z.string().optional(),
  disambiguation_status: DisambiguationStatusSchema,
  specialties: z.array(z.string()).default([]),
  role_labels: z.array(z.string()).optional(),
  external_ids: AuthorIdsSchema.optional(),
  tags: HcpTagsSchema.optional(),
});

export const TwinResearchSchema = z.object({
  author_ids: AuthorIdsSchema.optional(),
  themes: z.array(z.string()).optional(),
  recent_pubs: z.array(z.unknown()).optional(),
});

export const TwinMetaSchema = z.object({
  schema_version: z.string(),
  hcp_id: z.string().min(1),
  as_of: z.string(),
  twin_version: z.number().int().nonnegative(),
  built_at: z.string().optional(),
  build_mode: z.enum(["full", "incremental"]).optional(),
});

export const VirtualTwinSchema = z
  .object({
    meta: TwinMetaSchema,
    identity: TwinIdentitySchema.optional(),
    profile: TwinProfileSchema,
    career: z.record(z.string(), z.unknown()).optional(),
    research: TwinResearchSchema.optional(),
    activity: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((twin, ctx) => {
    if (twin.profile.disambiguation_status === "resolved") {
      const ids =
        twin.research?.author_ids ?? twin.profile.external_ids ?? undefined;
      if (!hasActiveP0AuthorId(ids)) {
        ctx.addIssue({
          code: "custom",
          message:
            "disambiguation_status=resolved 时须至少有一个活跃 P0 AuthorId（A9）",
          path: ["research", "author_ids"],
        });
      }
      if (!twin.profile.tags?.hcp_tier) {
        ctx.addIssue({
          code: "custom",
          message: "resolved 时 profile.tags.hcp_tier 必填",
          path: ["profile", "tags", "hcp_tier"],
        });
      }
    }
  });

export type VirtualTwin = z.infer<typeof VirtualTwinSchema>;

export const HcpInsightsSchema = z.object({
  hcp_id: z.string().min(1),
  as_of: z.string(),
  doing_now: z.string().optional(),
  interest_directions: z.array(z.unknown()).optional(),
  opportunities: z.array(z.unknown()).optional(),
  evidence: z.array(z.unknown()).optional(),
});

export type HcpInsights = z.infer<typeof HcpInsightsSchema>;

/** Reject obviously forbidden CRM / Rx fields if present on input objects. */
export function assertNoComplianceForbiddenFields(
  payload: Record<string, unknown>,
): void {
  const banned = [
    "prescription_volume",
    "rx_share",
    "统方",
    "处方量",
    "销量潜力",
    "private_wechat",
    "patient_mrn",
  ];
  for (const key of banned) {
    if (key in payload) {
      throw new Error(`COMPLIANCE_BLOCKED: 禁止字段 ${key}`);
    }
  }
}
