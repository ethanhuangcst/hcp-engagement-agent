type AuthorIds = Record<string, string | null | undefined>;

const LABELS: Array<{ key: string; label: string }> = [
  { key: "orcid", label: "ORCID" },
  { key: "pubmed_author", label: "PubMed Author" },
  { key: "google_scholar", label: "Google Scholar" },
  { key: "openalex", label: "OpenAlex" },
  { key: "scopus_author_id", label: "Scopus" },
  { key: "cnki_scholar", label: "CNKI" },
];

export function AuthorIdsTable({ ids }: { ids?: AuthorIds | null }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-lg font-medium">文献检索号码</h2>
      <div className="h-px bg-[var(--hca-line)]" />
      <div className="grid grid-cols-[140px_1fr] gap-x-2 gap-y-2">
        {LABELS.map(({ key, label }) => {
          const v = ids?.[key];
          return (
            <div key={key} className="contents">
              <span className="text-xs text-[var(--hca-ink-muted)]">{label}</span>
              <span
                className={`font-[family-name:var(--font-mono)] text-xs ${
                  v ? "text-[var(--hca-ink)]" : "text-[var(--hca-ink-muted)]"
                }`}
              >
                {v ?? "待绑定"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
