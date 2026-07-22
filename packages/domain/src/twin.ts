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

export const UiLocaleSchema = z.enum(["zh-CN", "en"]);
export type UiLocale = z.infer<typeof UiLocaleSchema>;

export const TwinResearchSchema = z.object({
  author_ids: AuthorIdsSchema.optional(),
  themes: z.array(z.string()).optional(),
  /** Localized theme labels; source `themes` kept as-is. */
  themes_i18n: z
    .object({
      "zh-CN": z.array(z.string()).optional(),
      en: z.array(z.string()).optional(),
    })
    .optional(),
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

/** Agent-owned one-line insight (数字分身列表/详情与 HCP 洞察同源). */
export const DoingNowSchema = z.object({
  summary: z.string().min(1),
  analysis: z.string().optional(),
  evidence_refs: z.array(z.string()).optional(),
  as_of: z.string(),
  /** UI locale used when this narrative was generated; omit on legacy rows → treat as zh-CN. */
  locale: z.enum(["zh-CN", "en"]).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  llm: z
    .object({
      provider: z.string().min(1),
      model: z.string().min(1),
    })
    .optional(),
});

export type DoingNow = z.infer<typeof DoingNowSchema>;

/** Accept legacy string `doing_now` from early fixtures and coerce to object. */
export const DoingNowFieldSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim()) {
    return {
      summary: value.trim(),
      as_of: new Date().toISOString().slice(0, 10),
      confidence: "medium",
    };
  }
  return value;
}, DoingNowSchema.optional());

/** Per-locale narrative slice (does not include hcp_id / as_of). */
export const InsightsNarrativeSchema = z.object({
  doing_now: DoingNowFieldSchema,
  interest_directions: z.array(z.unknown()).optional(),
  opportunities: z.array(z.unknown()).optional(),
  evidence: z.array(z.unknown()).optional(),
});

export type InsightsNarrative = z.infer<typeof InsightsNarrativeSchema>;

export const HcpInsightsSchema = z.object({
  hcp_id: z.string().min(1),
  as_of: z.string(),
  /** Compat / last-written narrative (prefer zh-CN when dual buckets exist). */
  doing_now: DoingNowFieldSchema,
  interest_directions: z.array(z.unknown()).optional(),
  opportunities: z.array(z.unknown()).optional(),
  evidence: z.array(z.unknown()).optional(),
  /** Bilingual narrative buckets; UI picks by locale without overwriting the other. */
  locales: z
    .object({
      "zh-CN": InsightsNarrativeSchema.optional(),
      en: InsightsNarrativeSchema.optional(),
    })
    .optional(),
});

export type HcpInsights = z.infer<typeof HcpInsightsSchema>;

/** Legacy top-level fields as a narrative (for migration / fallback). */
export function topLevelNarrative(insights: HcpInsights): InsightsNarrative {
  return {
    doing_now: insights.doing_now,
    interest_directions: insights.interest_directions,
    opportunities: insights.opportunities,
    evidence: insights.evidence,
  };
}

/**
 * Pick narrative for UI locale.
 * Prefer locales[locale]; for zh-CN also fall back to top-level legacy;
 * for en do NOT fall back to Chinese top-level (avoid language bleed).
 */
export function pickInsightsNarrative(
  insights: HcpInsights,
  locale: UiLocale,
): InsightsNarrative {
  const bucket = insights.locales?.[locale];
  if (bucket?.doing_now?.summary?.trim() || bucket?.interest_directions?.length) {
    return {
      doing_now: bucket.doing_now ?? insights.doing_now,
      interest_directions: bucket.interest_directions,
      opportunities: bucket.opportunities,
      evidence: bucket.evidence,
    };
  }
  if (locale === "zh-CN") {
    return topLevelNarrative(insights);
  }
  // en: only use top-level if it was written as English
  const topLocale = insights.doing_now?.locale;
  if (topLocale === "en" && insights.doing_now?.summary?.trim()) {
    return topLevelNarrative(insights);
  }
  return {
    doing_now: undefined,
    interest_directions: bucket?.interest_directions,
    opportunities: bucket?.opportunities,
    evidence: bucket?.evidence,
  };
}

/** Merge a narrative into locales[locale] and sync top-level compat fields. */
export function withInsightsLocale(
  insights: HcpInsights,
  locale: UiLocale,
  narrative: InsightsNarrative,
): HcpInsights {
  const nextNarrative: InsightsNarrative = {
    doing_now: narrative.doing_now
      ? { ...narrative.doing_now, locale }
      : narrative.doing_now,
    interest_directions: narrative.interest_directions,
    opportunities: narrative.opportunities,
    evidence: narrative.evidence,
  };
  return {
    ...insights,
    doing_now: nextNarrative.doing_now,
    interest_directions: nextNarrative.interest_directions,
    opportunities: nextNarrative.opportunities,
    evidence: nextNarrative.evidence,
    locales: {
      ...insights.locales,
      [locale]: nextNarrative,
    },
    as_of:
      nextNarrative.doing_now?.as_of ||
      insights.as_of ||
      new Date().toISOString().slice(0, 10),
  };
}

/** Themes for display: prefer themes_i18n[locale], else source themes. */
export function pickResearchThemes(
  research: VirtualTwin["research"] | undefined,
  locale: UiLocale,
): string[] {
  const i18n = research?.themes_i18n?.[locale];
  if (i18n && i18n.length > 0) return i18n;
  if (locale === "en") {
    const src = research?.themes ?? [];
    // If all themes are CJK and no en bucket, return empty (UI shows empty / pending).
    if (src.length > 0 && src.every((t) => /[\u4e00-\u9fff]/.test(t))) {
      return [];
    }
  }
  return research?.themes ?? [];
}

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
