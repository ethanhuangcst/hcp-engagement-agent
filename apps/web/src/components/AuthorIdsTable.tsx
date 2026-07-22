"use client";

import { useT } from "@/i18n";

type AuthorIds = {
  orcid?: string | null;
  pubmed_author?: string | null;
  google_scholar?: string | null;
  openalex?: string | null;
  openalex_aliases?: string[] | null;
  scopus_author_id?: string | null;
  cnki_scholar?: string | null;
  [key: string]: string | string[] | null | undefined;
};

const LABELS: Array<{ key: string; label: string }> = [
  { key: "orcid", label: "ORCID" },
  { key: "pubmed_author", label: "PubMed Author" },
  { key: "google_scholar", label: "Google Scholar" },
  { key: "openalex", label: "OpenAlex" },
  { key: "openalex_aliases", label: "OpenAlex aliases" },
  { key: "scopus_author_id", label: "Scopus" },
  { key: "cnki_scholar", label: "CNKI" },
];

function formatValue(
  key: string,
  ids: AuthorIds | null | undefined,
  pending: string,
): string {
  if (key === "openalex_aliases") {
    const aliases = ids?.openalex_aliases;
    if (!Array.isArray(aliases) || aliases.length === 0) return pending;
    return aliases.join(", ");
  }
  const v = ids?.[key];
  if (typeof v === "string" && v.trim()) return v;
  return pending;
}

export function AuthorIdsTable({ ids }: { ids?: AuthorIds | null }) {
  const tr = useT();
  return (
    <section className="space-y-2.5">
      <h2 className="text-lg font-medium">{tr("twins.detail.authorIds")}</h2>
      <div className="h-px bg-[var(--hca-line)]" />
      <div className="grid grid-cols-[140px_1fr] gap-x-2 gap-y-2">
        {LABELS.map(({ key, label }) => {
          const pending = tr("common.pendingBind");
          const display = formatValue(key, ids, pending);
          const empty = display === pending;
          return (
            <div key={key} className="contents">
              <span className="text-xs text-[var(--hca-ink-muted)]">{label}</span>
              <span
                className={`font-[family-name:var(--font-mono)] text-xs ${
                  empty ? "text-[var(--hca-ink-muted)]" : "text-[var(--hca-ink)]"
                }`}
              >
                {display}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
