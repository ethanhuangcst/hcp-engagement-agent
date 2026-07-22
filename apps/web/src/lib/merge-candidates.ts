export type MergePersonCandidate = {
  candidate_id: string;
  name_zh: string;
  name_en?: string | null;
  hospital: string;
  department: string;
  title?: string | null;
  distinguish: string;
  confidence: "high" | "medium" | "low" | string;
  match_note: string;
  evidence: Array<{ kind: string; url?: string }>;
  hcpId?: string;
  author_ids_draft?: {
    orcid?: string | null;
    openalex?: string | null;
    openalex_aliases?: string[];
    [key: string]: string | string[] | null | undefined;
  };
  tags_draft?: {
    hcp_tier?: string;
    role_tags?: string[];
  };
};

function hospitalClose(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

function confidenceRank(c: string): number {
  if (c === "high") return 0;
  if (c === "medium") return 1;
  return 2;
}

/** Primary = closest hospital to query, then highest confidence. */
export function pickPrimaryCandidate(
  selected: MergePersonCandidate[],
  queryHospital: string,
): MergePersonCandidate {
  const sorted = [...selected].sort((a, b) => {
    const aH = hospitalClose(a.hospital, queryHospital) ? 1 : 0;
    const bH = hospitalClose(b.hospital, queryHospital) ? 1 : 0;
    if (aH !== bH) return bH - aH;
    return confidenceRank(a.confidence) - confidenceRank(b.confidence);
  });
  return sorted[0]!;
}

export function mergeCandidatesForConfirm(
  selected: MergePersonCandidate[],
  queryHospital: string,
): {
  primary: MergePersonCandidate;
  openalex_ids: string[];
  hospitalMismatch: boolean;
} {
  const primary = pickPrimaryCandidate(selected, queryHospital);
  const openalex_ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | null | undefined) => {
    if (!id || typeof id !== "string") return;
    const n = id.trim();
    if (!n || seen.has(n)) return;
    seen.add(n);
    openalex_ids.push(n);
  };
  push(
    typeof primary.author_ids_draft?.openalex === "string"
      ? primary.author_ids_draft.openalex
      : null,
  );
  for (const c of selected) {
    push(
      typeof c.author_ids_draft?.openalex === "string"
        ? c.author_ids_draft.openalex
        : null,
    );
  }
  const orcid =
    (typeof primary.author_ids_draft?.orcid === "string"
      ? primary.author_ids_draft.orcid
      : null) ??
    selected
      .map((c) =>
        typeof c.author_ids_draft?.orcid === "string"
          ? c.author_ids_draft.orcid
          : null,
      )
      .find((v) => Boolean(v)) ??
    null;
  const aliases = openalex_ids.slice(1);
  const merged: MergePersonCandidate = {
    ...primary,
    author_ids_draft: {
      ...(primary.author_ids_draft ?? {}),
      openalex: openalex_ids[0] ?? primary.author_ids_draft?.openalex ?? null,
      openalex_aliases: aliases.length > 0 ? aliases : undefined,
      orcid,
    },
  };
  const hospitalMismatch = selected.some(
    (c) => !hospitalClose(c.hospital, queryHospital),
  );
  return { primary: merged, openalex_ids, hospitalMismatch };
}
