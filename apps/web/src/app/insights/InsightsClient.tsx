"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthorIdsTable } from "@/components/AuthorIdsTable";
import { TagBadges } from "@/components/TagBadges";
import { HcpNameHeading } from "@/components/HcpNameHeading";
import { useLocale, useT } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import { useHcpContext } from "@/store/hcp-context";
import {
  pickInsightsNarrative,
  pickResearchThemes,
  type HcpInsights,
  type VirtualTwin,
} from "@hca/domain";

type DoingNow = {
  summary?: string;
  analysis?: string;
  as_of?: string;
  confidence?: string;
  locale?: string;
};

type Insights = HcpInsights;

type ActivityEvent = {
  name?: string;
  date?: string | null;
  location?: string | null;
  url?: string | null;
  bucket?: string | null;
};

type ActivityWindows = Record<
  string,
  { event_count?: number; no_public_evidence?: boolean; events?: ActivityEvent[] }
>;

type TFn = (key: MessageKey, vars?: Record<string, string>) => string;

const HEAT_COLS = [
  ["earlier", "common.heatmap.earlier"],
  ["d90", "common.heatmap.d90"],
  ["d60", "common.heatmap.d60"],
  ["d30", "common.heatmap.d30"],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>;

function asDoingNow(raw: Insights["doing_now"]): DoingNow | null {
  if (!raw) return null;
  if (typeof raw === "string") return { summary: raw };
  return raw;
}

/** Internal kind → localized source label (avoid exposing codes like stage_e_draft) */
function evidenceLabel(
  tr: TFn,
  e: {
    kind?: string;
    name?: string;
    source_type?: string;
  },
  index: number,
): string {
  if (e.name?.trim()) return e.name.trim();
  const kind = (e.kind ?? e.source_type ?? "").toLowerCase();
  const keyMap: Record<string, MessageKey> = {
    stage_e_draft: "insights.src.stageE",
    derived: "insights.src.stageE",
    openalex: "insights.src.openalex",
    publication: "insights.src.publication",
    hospital: "insights.src.hospital",
  };
  // Brand / registry names are locale-invariant
  const brandMap: Record<string, string> = {
    pubmed: "PubMed",
    orcid: "ORCID",
    clinicaltrials: "ClinicalTrials.gov",
  };
  if (kind && keyMap[kind]) return tr(keyMap[kind]);
  if (kind && brandMap[kind]) return brandMap[kind];
  if (e.kind?.trim()) return e.kind.trim();
  if (e.source_type?.trim()) return e.source_type.trim();
  return tr("insights.evidenceN", { n: String(index + 1) });
}

function confidenceLabel(tr: TFn, raw?: string): string {
  if (!raw || raw === "—") return tr("common.confidence.medium");
  const m: Record<string, MessageKey> = {
    high: "common.confidence.high",
    medium: "common.confidence.medium",
    low: "common.confidence.low",
  };
  const key = m[raw.toLowerCase()];
  return key ? tr(key) : raw;
}

type OpportunityRow = {
  title?: string;
  priority?: string;
  note?: string;
  owner?: string;
  channel?: string;
};

function opportunityList(insights: Insights | null): OpportunityRow[] {
  const o = insights?.opportunities as
    | OpportunityRow[]
    | { items?: OpportunityRow[] }
    | undefined;
  if (!o) return [];
  if (Array.isArray(o)) return o;
  if (Array.isArray(o.items)) return o.items;
  return [];
}

function windowEvents(
  activity: { events?: ActivityEvent[]; windows?: ActivityWindows } | undefined,
  key: string,
): { empty: boolean; items: ActivityEvent[] } {
  const w = activity?.windows?.[key];
  if (w?.no_public_evidence) return { empty: true, items: [] };
  if (w?.events?.length) return { empty: false, items: w.events };
  const all = activity?.events ?? [];
  // No windowed events: fill global events into "earlier" only when windows absent
  if (key === "earlier" && all.length && !activity?.windows) {
    return { empty: false, items: all.slice(0, 5) };
  }
  if (typeof w?.event_count === "number" && w.event_count === 0) {
    return { empty: true, items: [] };
  }
  if (!w && !all.length) return { empty: true, items: [] };
  return { empty: true, items: [] };
}

export default function InsightsClient() {
  const params = useParams<{ hcpId?: string }>();
  const routeHcpId = params.hcpId
    ? decodeURIComponent(params.hcpId)
    : null;
  const tr = useT();
  const locale = useLocale();
  const { selectedHcpId, selectedName, openTwin } = useHcpContext();
  const hcpId = routeHcpId ?? selectedHcpId;
  const [twin, setTwin] = useState<VirtualTwin | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [synthBusy, setSynthBusy] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!hcpId) {
      setLoading(false);
      setTwin(null);
      setInsights(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/insights/${encodeURIComponent(hcpId)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? tr("insights.loadFailed"));
        setTwin(null);
        setInsights(null);
        return;
      }
      setTwin(data.twin);
      setInsights(data.insights);
      if (data.twin?.profile?.name_zh) {
        openTwin(
          hcpId,
          data.twin.profile.name_zh,
          data.twin.profile.name_en ?? data.twin.identity?.name_en,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [hcpId, openTwin, tr]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSynthesize = async (refresh: boolean) => {
    if (!hcpId) return;
    setSynthBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/doing-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hcpId, refresh, locale }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? tr("insights.synthFailed"));
        return;
      }
      setInsights((prev) =>
        prev
          ? { ...prev, doing_now: data.doing_now }
          : {
              hcp_id: hcpId,
              as_of: data.doing_now?.as_of,
              doing_now: data.doing_now,
            },
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSynthBusy(false);
    }
  };

  const onExport = () => {
    setExportNote(tr("insights.exportNote"));
    window.setTimeout(() => window.print(), 100);
  };

  if (!hcpId) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-[var(--hca-ink-muted)]">
          {tr("insights.title")}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium">
          {tr("insights.noHcp")}
        </h1>
        <p className="text-sm text-[var(--hca-ink-muted)]">
          {tr("insights.noHcpHint")}
        </p>
        <Link href="/twins" className="text-sm text-[var(--hca-accent)] underline">
          {tr("insights.goList")}
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <p className="text-sm text-[var(--hca-ink-muted)]">
        {tr("insights.loading")}
      </p>
    );
  }

  if (error && !twin) {
    return (
      <p className="text-sm text-[var(--hca-danger)]" role="alert">
        {error}
      </p>
    );
  }

  if (!twin) {
    return (
      <p className="text-sm text-[var(--hca-ink-muted)]">
        {tr("insights.notFound", { id: hcpId })}
      </p>
    );
  }

  const narrative = insights
    ? pickInsightsNarrative(insights, locale)
    : null;
  const doing = asDoingNow(narrative?.doing_now);
  const themes = pickResearchThemes(twin.research, locale);
  const pubs =
    (twin.research?.recent_pubs as
      | Array<{ title?: string; year?: number | null; url?: string | null }>
      | undefined) ?? [];
  const ids =
    twin.research?.author_ids ?? twin.profile.external_ids ?? undefined;
  const activity = twin.activity as
    | {
        events?: ActivityEvent[];
        windows?: ActivityWindows;
        last_polled_at?: string;
      }
    | undefined;
  const interests = (narrative?.interest_directions ?? []) as Array<{
    title?: string;
    analysis?: string;
    confidence?: string;
    bucket?: string;
    compliance_note?: string;
  }>;
  const opps = opportunityList(
    narrative
      ? ({
          hcp_id: insights!.hcp_id,
          as_of: insights!.as_of,
          opportunities: narrative.opportunities,
        } as Insights)
      : null,
  );
  const evidence = (narrative?.evidence ?? []) as Array<{
    kind?: string;
    name?: string;
    source_url?: string;
    url?: string;
    source_type?: string;
    confidence?: string;
    as_of?: string;
  }>;
  const d90 = windowEvents(activity, "d90");

  const knownEvents = (activity?.events ?? []).slice(0, 8);
  const tier = twin.profile.tags?.hcp_tier ?? "—";

  return (
    <div className="hca-insights-print space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs text-[var(--hca-ink-muted)]">
            {tr("insights.title")}
          </p>
          <HcpNameHeading
            className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight"
            nameZh={twin.profile.name_zh || selectedName || ""}
            nameEn={twin.profile.name_en ?? twin.identity?.name_en}
          />
          <TagBadges tags={twin.profile.tags} />
          <p className="text-[13px] text-[var(--hca-ink-muted)]">
            {twin.profile.hospital} · {twin.profile.department}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
            as_of {insights?.as_of ?? twin.meta.as_of} · twin_version{" "}
            {twin.meta.twin_version ?? "—"}
          </p>
          <div className="flex flex-wrap justify-end gap-2 hca-no-print">
            <button
              type="button"
              className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-3 py-1.5 text-sm"
              disabled={synthBusy}
              onClick={() => void onSynthesize(false)}
            >
              {synthBusy ? tr("insights.synthBusy") : tr("insights.synth")}
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-3 py-1.5 text-sm"
              disabled={synthBusy}
              onClick={() => void onSynthesize(true)}
            >
              {tr("insights.refresh")}
            </button>
            <button
              type="button"
              className="hca-btn-primary px-3 py-1.5"
              onClick={onExport}
            >
              {tr("insights.export")}
            </button>
          </div>
        </div>
      </div>

      {exportNote ? (
        <p className="text-sm text-[var(--hca-ink-muted)] hca-no-print">
          {exportNote}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-[var(--hca-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {/* F-WEB-018 */}
      <section className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-4 py-3">
        <p className="text-xs text-[var(--hca-ink-muted)]">
          {tr("insights.doingNow")}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">
          {doing?.summary ?? tr("insights.doingNowEmpty")}
        </p>
        {doing?.analysis ? (
          <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--hca-ink-muted)]">
            {tr("insights.analysis", { text: doing.analysis })}
          </p>
        ) : null}
      </section>

      <AuthorIdsTable ids={ids as Record<string, string | null | undefined>} />

      {/* F-WEB-025 KPI ≤3 */}
      <div className="flex flex-wrap gap-8">
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl">
            {themes.length || "—"}
          </p>
          <p className="text-xs text-[var(--hca-ink-muted)]">
            {tr("insights.kpi.themes")}
          </p>
        </div>
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl">
            {d90.empty
              ? "0"
              : String(
                  d90.items.length ||
                    activity?.windows?.d90?.event_count ||
                    0,
                )}
          </p>
          <p className="text-xs text-[var(--hca-ink-muted)]">
            {tr("insights.kpi.events90")}
          </p>
        </div>
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl">
            {tier}
          </p>
          <p className="text-xs text-[var(--hca-ink-muted)]">
            {tr("insights.kpi.tier")}
          </p>
        </div>
      </div>

      {/* F-WEB-019 */}
      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">{tr("insights.research")}</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        {themes.length === 0 ? (
          <p className="text-sm text-[var(--hca-ink-muted)]">
            {tr("insights.researchEmpty")}
          </p>
        ) : (
          <div className="space-y-4">
            {themes.map((theme) => {
              const related = pubs.filter((p) =>
                (p.title ?? "")
                  .toLowerCase()
                  .includes(theme.toLowerCase().slice(0, 4)),
              );
              const fallback = related.length ? related : pubs.slice(0, 2);
              return (
                <div key={theme}>
                  <h3 className="text-[15px] font-medium">{theme}</h3>
                  <ul className="mt-2 space-y-1.5">
                    {fallback.length === 0 ? (
                      <li className="text-[13px] text-[var(--hca-ink-muted)]">
                        {tr("insights.noPubs")}
                      </li>
                    ) : (
                      fallback.map((p, i) => (
                        <li key={`${theme}-${i}`} className="text-[13px]">
                          <span className="mr-2 text-[11px] text-[var(--hca-ink-muted)]">
                            {tr("insights.pub")}
                          </span>
                          {p.url ? (
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--hca-accent)] hover:underline"
                            >
                              {p.title}
                            </a>
                          ) : (
                            p.title
                          )}
                          {p.year != null ? (
                            <span className="ml-2 font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
                              {p.year}
                            </span>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* F-WEB-020 */}
      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">{tr("insights.heatmap")}</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        <p className="text-xs text-[var(--hca-ink-muted)]">
          {tr("insights.heatmapCaption")}
          {activity?.last_polled_at
            ? ` · last_polled_at ${activity.last_polled_at}`
            : ""}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr>
                {HEAT_COLS.map(([key, labelKey]) => (
                  <th
                    key={key}
                    className="border-b border-[var(--hca-line)] px-3 py-2.5 text-left font-medium text-[var(--hca-ink-muted)]"
                  >
                    {tr(labelKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {HEAT_COLS.map(([key]) => {
                  const cell = windowEvents(activity, key);
                  return (
                    <td
                      key={key}
                      className="min-w-[140px] border-b border-[var(--hca-line)] px-3 py-3 align-top"
                    >
                      {cell.empty || cell.items.length === 0 ? (
                        <span className="text-[var(--hca-ink-muted)]">
                          {tr("common.noPublicEvidence")}
                        </span>
                      ) : (
                        <ul className="space-y-2">
                          {cell.items.map((e, i) => (
                            <li key={`${key}-${i}`}>
                              <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
                                {e.date ?? "—"}
                              </span>
                              {e.location ? ` · ${e.location}` : ""}
                              {" · "}
                              {e.url ? (
                                <a
                                  href={e.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--hca-accent)] hover:underline"
                                >
                                  {e.name}
                                </a>
                              ) : (
                                e.name
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* F-WEB-021 */}
      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">{tr("insights.recentEvents")}</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        {knownEvents.length === 0 ? (
          <p className="text-sm text-[var(--hca-ink-muted)]">
            {tr("insights.recentEmpty")}
          </p>
        ) : (
          <ul className="space-y-2 text-[13px]">
            {knownEvents.map((e, i) => (
              <li key={`known-${i}`}>
                {e.date ?? "—"}
                {e.location ? ` · ${e.location}` : ""}
                {" · "}
                {e.url ? (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--hca-accent)] hover:underline"
                  >
                    {e.name}
                  </a>
                ) : (
                  e.name
                )}
                {e.bucket ? ` · ${e.bucket}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* F-WEB-022 / 023 */}
      <div className="grid gap-7 md:grid-cols-2">
        <section className="space-y-2.5">
          <h2 className="text-lg font-medium">{tr("insights.interest")}</h2>
          <div className="h-px bg-[var(--hca-line)]" />
          {interests.length === 0 ? (
            <p className="text-sm text-[var(--hca-ink-muted)]">
              {tr("insights.interestEmpty")}
            </p>
          ) : (
            <ol className="space-y-3">
              {interests.map((it, i) => (
                <li key={`${it.title}-${i}`} className="space-y-1">
                  <p className="text-[13px] font-medium">
                    {i + 1}. {it.title ?? tr("insights.unnamedInterest")}
                    {it.bucket ? (
                      <span className="ml-2 text-[11px] font-normal text-[var(--hca-ink-muted)]">
                        {it.bucket}
                      </span>
                    ) : null}
                  </p>
                  {it.analysis ? (
                    <p className="text-[13px] leading-relaxed text-[var(--hca-ink-muted)]">
                      {it.analysis}
                    </p>
                  ) : (
                    <p className="text-[13px] text-[var(--hca-ink-muted)]">
                      {tr("insights.analysisPending")}
                    </p>
                  )}
                  {it.compliance_note ? (
                    <p className="text-[11px] text-[var(--hca-ink-muted)]">
                      {tr("insights.complianceNote", {
                        note: it.compliance_note,
                      })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="space-y-2.5">
          <h2 className="text-lg font-medium">
            {tr("insights.opportunities")}
          </h2>
          <div className="h-px bg-[var(--hca-line)]" />
          {opps.length === 0 ? (
            <p className="text-sm text-[var(--hca-ink-muted)]">
              {tr("insights.opportunitiesEmpty")}
            </p>
          ) : (
            <ul className="space-y-3">
              {opps.map((o, i) => (
                <li key={`${o.title}-${i}`} className="space-y-1">
                  <p className="text-[13px] font-medium">
                    {o.title ??
                      tr("insights.opportunityN", { n: String(i + 1) })}
                    {o.priority ? (
                      <span className="ml-2 text-[11px] font-normal text-[var(--hca-ink-muted)]">
                        {tr("insights.priority", { p: o.priority })}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[13px] leading-relaxed text-[var(--hca-ink-muted)]">
                    {o.note ?? "—"}
                    {o.owner || o.channel
                      ? ` · ${tr("insights.suggest", {
                          who: [o.owner, o.channel].filter(Boolean).join(" / "),
                        })}`
                      : ""}
                  </p>
                  <p className="text-[11px] text-[var(--hca-ink-muted)]">
                    {tr("insights.noAssume")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* F-WEB-024 */}
      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">{tr("insights.evidence")}</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        {evidence.length === 0 ? (
          <p className="text-sm text-[var(--hca-ink-muted)]">
            {tr("insights.evidenceEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {(
                    [
                      "insights.col.source",
                      "insights.col.confidence",
                      "insights.col.asOf",
                    ] as const
                  ).map((h) => (
                    <th
                      key={h}
                      className="border-b border-[var(--hca-line)] px-3 py-2 text-left font-medium text-[var(--hca-ink-muted)]"
                    >
                      {tr(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidence.map((e, i) => {
                  const href = e.source_url || e.url;
                  const label = evidenceLabel(tr, e, i);
                  return (
                    <tr key={i}>
                      <td className="border-b border-[var(--hca-line)] px-3 py-2">
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--hca-accent)] hover:underline"
                          >
                            {label}
                          </a>
                        ) : (
                          label
                        )}
                      </td>
                      <td className="border-b border-[var(--hca-line)] px-3 py-2 text-[var(--hca-ink-muted)]">
                        {confidenceLabel(tr, e.confidence)}
                      </td>
                      <td className="border-b border-[var(--hca-line)] px-3 py-2 font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
                        {e.as_of ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
