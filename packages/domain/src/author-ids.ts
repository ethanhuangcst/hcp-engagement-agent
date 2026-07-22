import { z } from "zod";

/** Normalize OpenAlex author id to `A` + digits (uppercase A). */
export function normalizeOpenAlexId(
  raw: string | null | undefined,
): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.replace(
    /^https?:\/\/openalex\.org\/authors\//i,
    "",
  );
  const m = fromUrl.match(/A\d+/i);
  return m ? m[0]!.toUpperCase() : null;
}

/** Active P0 literature IDs — at least one required when resolved (A9). */
export const AuthorIdsSchema = z.object({
  orcid: z.string().nullable().optional(),
  pubmed_author: z.string().nullable().optional(),
  openalex: z.string().nullable().optional(),
  /** Other confirmed OpenAlex author clusters for the same HCP (ADR-004). */
  openalex_aliases: z.array(z.string()).optional(),
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

/**
 * Deduplicate OpenAlex ids; promote aliases[0] to primary when primary missing.
 * Aliases never include the primary.
 */
export function normalizeOpenAlexBinding(
  ids: AuthorIds | null | undefined,
): AuthorIds {
  const base: AuthorIds = { ...(ids ?? {}) };
  const primary = normalizeOpenAlexId(base.openalex);
  const aliasRaw = Array.isArray(base.openalex_aliases)
    ? base.openalex_aliases
    : [];
  const seen = new Set<string>();
  const aliases: string[] = [];
  if (primary) seen.add(primary);
  for (const a of aliasRaw) {
    const n = normalizeOpenAlexId(a);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    aliases.push(n);
  }
  if (!primary && aliases.length > 0) {
    const [first, ...rest] = aliases;
    return {
      ...base,
      openalex: first!,
      openalex_aliases: rest.length > 0 ? rest : undefined,
    };
  }
  return {
    ...base,
    openalex: primary,
    openalex_aliases: aliases.length > 0 ? aliases : undefined,
  };
}

/** Primary + aliases, normalized and unique (primary first). */
export function allOpenAlexIds(
  ids: AuthorIds | null | undefined,
): string[] {
  const n = normalizeOpenAlexBinding(ids);
  const out: string[] = [];
  if (n.openalex) out.push(n.openalex);
  for (const a of n.openalex_aliases ?? []) {
    if (!out.includes(a)) out.push(a);
  }
  return out;
}

/**
 * Merge multiple OpenAlex ids into primary + aliases.
 * `preferredPrimary` wins when present in the set; else first id.
 */
export function mergeOpenAlexIds(
  ids: Iterable<string | null | undefined>,
  preferredPrimary?: string | null,
): Pick<AuthorIds, "openalex" | "openalex_aliases"> {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const n = normalizeOpenAlexId(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    ordered.push(n);
  }
  const pref = normalizeOpenAlexId(preferredPrimary ?? undefined);
  let primary = ordered[0] ?? null;
  if (pref && seen.has(pref)) primary = pref;
  const aliases = ordered.filter((id) => id !== primary);
  return {
    openalex: primary,
    openalex_aliases: aliases.length > 0 ? aliases : undefined,
  };
}

/**
 * Bind an additional OpenAlex id without dropping the previous primary.
 * If `promote` is true, `incoming` becomes primary and old primary goes to aliases.
 */
export function bindOpenAlexId(
  ids: AuthorIds | null | undefined,
  incoming: string | null | undefined,
  opts?: { promote?: boolean },
): AuthorIds {
  const n = normalizeOpenAlexBinding(ids);
  const next = normalizeOpenAlexId(incoming);
  if (!next) return n;
  const current = n.openalex ?? null;
  if (!current) {
    return { ...n, openalex: next, openalex_aliases: n.openalex_aliases };
  }
  if (current === next) return n;
  if (opts?.promote) {
    const aliases = [
      current,
      ...(n.openalex_aliases ?? []).filter((a) => a !== next && a !== current),
    ];
    return {
      ...n,
      openalex: next,
      openalex_aliases: aliases.length > 0 ? aliases : undefined,
    };
  }
  const aliases = [
    ...(n.openalex_aliases ?? []).filter((a) => a !== next),
    next,
  ];
  return {
    ...n,
    openalex_aliases: aliases.length > 0 ? aliases : undefined,
  };
}

export function hasActiveP0AuthorId(ids: AuthorIds | null | undefined): boolean {
  if (!ids) return false;
  const n = normalizeOpenAlexBinding(ids);
  return ACTIVE_P0_AUTHOR_KEYS.some((k) => {
    const v = n[k];
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
):
  | { ok: true }
  | {
      ok: false;
      code: "AUTHOR_IDS_REQUIRED" | "UNRESOLVED_IDENTITY";
      message: string;
      repair_hint: string;
    } {
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
      message:
        "resolved 时须至少绑定一个活跃 P0 文献号（orcid / pubmed_author / openalex）",
      repair_hint: "补 ORCID、PubMed Author ID 或 OpenAlex Author ID 后再灌库",
    };
  }
  return { ok: true };
}
