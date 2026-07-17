import { z } from "zod";

/** Active P0 literature IDs — at least one required when resolved (A9). */
export const AuthorIdsSchema = z.object({
  orcid: z.string().nullable().optional(),
  pubmed_author: z.string().nullable().optional(),
  openalex: z.string().nullable().optional(),
  google_scholar: z.string().nullable().optional(),
  scopus_author_id: z.string().nullable().optional(),
  wos_researcher_id: z.string().nullable().optional(),
  semantic_scholar: z.string().nullable().optional(),
  dimensions: z.string().nullable().optional(),
  cnki_scholar: z.string().nullable().optional(),
  wanfang_author: z.string().nullable().optional(),
});

export type AuthorIds = z.infer<typeof AuthorIdsSchema>;

export const ACTIVE_P0_AUTHOR_KEYS = [
  "orcid",
  "pubmed_author",
  "openalex",
] as const;

export function hasActiveP0AuthorId(ids: AuthorIds | null | undefined): boolean {
  if (!ids) return false;
  return ACTIVE_P0_AUTHOR_KEYS.some((k) => {
    const v = ids[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

/**
 * Stage C literature ingest gate (F-MCP-014 / A9).
 * Rejects Chinese-name-only ingest when no active P0 AuthorId.
 */
export function assertAuthorIdsForLiteratureIngest(
  disambiguationStatus: string | undefined,
  authorIds: AuthorIds | null | undefined,
): { ok: true } | { ok: false; code: "AUTHOR_IDS_REQUIRED" | "UNRESOLVED_IDENTITY"; message: string; repair_hint: string } {
  if (disambiguationStatus !== "resolved") {
    return {
      ok: false,
      code: "UNRESOLVED_IDENTITY",
      message: "消歧未完成，禁止仅凭姓名灌文献库",
      repair_hint: "先完成 resolve 并确认候选，使 disambiguation_status=resolved",
    };
  }
  if (!hasActiveP0AuthorId(authorIds)) {
    return {
      ok: false,
      code: "AUTHOR_IDS_REQUIRED",
      message: "resolved 时须至少绑定一个活跃 P0 文献号（orcid / pubmed_author / openalex）",
      repair_hint: "补 ORCID、PubMed Author ID 或 OpenAlex Author ID 后再灌库",
    };
  }
  return { ok: true };
}
