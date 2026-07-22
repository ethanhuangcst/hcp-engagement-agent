"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthorIdsTable } from "@/components/AuthorIdsTable";
import { IntelligenceBuildPanel } from "@/components/BuildProgress";
import { CareerTimeline } from "@/components/CareerTimeline";
import { HcpNameHeading } from "@/components/HcpNameHeading";
import { TagBadges } from "@/components/TagBadges";
import { useLocale, useT } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import { readResponseJson } from "@/lib/http-json";
import { useHcpContext } from "@/store/hcp-context";
import {
  pickInsightsNarrative,
  pickResearchThemes,
  type HcpInsights,
  type VirtualTwin,
} from "@hca/domain";

const HEATMAP_WINDOWS = [
  ["earlier", "common.heatmap.earlier"],
  ["d90", "common.heatmap.d90"],
  ["d60", "common.heatmap.d60"],
  ["d30", "common.heatmap.d30"],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>;

function kbStatusLabel(
  tr: (key: MessageKey, vars?: Record<string, string>) => string,
  st: string,
): string {
  if (st === "ready") return tr("common.kb.ready");
  if (st === "sparse") return tr("common.kb.sparse");
  if (st === "failed") return tr("common.kb.failed");
  return tr("common.kb.pending");
}

export default function TwinDetailClient() {
  const params = useParams<{ hcpId: string }>();
  const hcpId = decodeURIComponent(params.hcpId);
  const tr = useT();
  const locale = useLocale();
  const { openTwin } = useHcpContext();
  const [twin, setTwin] = useState<VirtualTwin | null>(null);
  const [insights, setInsights] = useState<HcpInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [knowledgeStatus, setKnowledgeStatus] = useState<
    Record<string, string>
  >({});

  const specialtyKey = (twin?.profile.specialties ?? []).join("|");

  useEffect(() => {
    const specialties = twin?.profile.specialties ?? [];
    if (specialties.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      for (const specialty of specialties) {
        try {
          const res = await fetch(
            `/api/rag/ingest/status?specialty=${encodeURIComponent(specialty)}`,
          );
          if (!res.ok) continue;
          const data = (await res.json()) as {
            knowledge_status?: string;
            status?: string;
          };
          if (cancelled) return;
          setKnowledgeStatus((prev) => ({
            ...prev,
            [specialty]:
              data.knowledge_status ?? data.status ?? "pending",
          }));
        } catch {
          /* ignore poll errors */
        }
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 12_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [specialtyKey, twin]);

  const reload = useCallback(async () => {
    const [tRes, iRes] = await Promise.all([
      fetch(`/api/twins/${encodeURIComponent(hcpId)}`),
      fetch(`/api/insights/${encodeURIComponent(hcpId)}`),
    ]);
    let tData: {
      twin?: VirtualTwin;
      error?: { message?: string };
    };
    try {
      tData = await readResponseJson(tRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!tRes.ok) {
      setError(tData?.error?.message ?? tr("common.loadFailed"));
      return;
    }
    setTwin(tData.twin ?? null);
    openTwin(
      hcpId,
      tData.twin?.profile?.name_zh ?? hcpId,
      tData.twin?.profile?.name_en ?? tData.twin?.identity?.name_en,
    );
    if (iRes.ok) {
      try {
        const iData = await readResponseJson<{ insights?: HcpInsights }>(iRes);
        setInsights(iData.insights ?? null);
      } catch {
        /* insights optional */
      }
    }
  }, [hcpId, openTwin, tr]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onBuild = async () => {
    setBuilding(true);
    setError(null);
    setRunId(null);
    try {
      const res = await fetch(
        `/api/twins/${encodeURIComponent(hcpId)}/build`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "full" }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? tr("twins.detail.buildStartFailed"));
        setBuilding(false);
        return;
      }
      setRunId(data.runId as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBuilding(false);
    }
  };

  const onBuildTerminal = useCallback(
    (phase: "done" | "error") => {
      setBuilding(false);
      if (phase === "done") {
        void reload().then(() => setRunId(null));
      }
      if (phase === "error") {
        setError(tr("twins.detail.buildFailed"));
      }
    },
    [reload, tr],
  );

  const narrative = insights
    ? pickInsightsNarrative(insights, locale)
    : null;
  const doingNow =
    typeof narrative?.doing_now === "string"
      ? narrative.doing_now
      : narrative?.doing_now?.summary;

  if (error && !twin) {
    return (
      <p className="text-sm text-[var(--hca-danger)]" role="alert">
        {error}
      </p>
    );
  }
  if (!twin) {
    return (
      <p className="text-sm text-[var(--hca-ink-muted)]">{tr("common.loading")}</p>
    );
  }

  const ids =
    twin.research?.author_ids ?? twin.profile.external_ids ?? undefined;
  const themes = pickResearchThemes(twin.research, locale);
  const specialties = twin.profile.specialties ?? [];
  const pubs =
    (twin.research?.recent_pubs as
      | Array<{ title?: string; year?: number | null; url?: string | null }>
      | undefined) ?? [];
  const activity = twin.activity as
    | {
        last_polled_at?: string;
        events?: Array<{ name?: string; date?: string | null; url?: string }>;
        windows?: Record<string, { event_count?: number; no_public_evidence?: boolean }>;
      }
    | undefined;

  const insightsHref = `/twins/${encodeURIComponent(hcpId)}/insights`;

  return (
    <div className="space-y-6">
      {error ? (
        <p className="text-sm text-[var(--hca-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <HcpNameHeading
          className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight"
          nameZh={twin.profile.name_zh}
          nameEn={twin.profile.name_en ?? twin.identity?.name_en}
        />
        <TagBadges tags={twin.profile.tags} />
        <p className="text-[13px] text-[var(--hca-ink-muted)]">
          {twin.profile.hospital} · {twin.profile.department}
          {twin.profile.title ? ` · ${twin.profile.title}` : ""}
        </p>
        <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
          hcp:{twin.meta.hcp_id} · as_of {twin.meta.as_of}
          {twin.meta.build_mode ? ` · build ${twin.meta.build_mode}` : ""}
        </p>
        {specialties.length > 0 ? (
          <p className="text-[11px] text-[var(--hca-ink-muted)]">
            {tr("common.kb.label")}
            {specialties
              .map((s) => {
                const st = knowledgeStatus[s] ?? "pending";
                return `${s} ${kbStatusLabel(tr, st)}`;
              })
              .join(" · ")}
          </p>
        ) : null}
      </div>

      <IntelligenceBuildPanel
        hcpId={hcpId}
        twin={twin}
        runId={runId}
        building={building}
        onBuild={() => void onBuild()}
        onTerminal={onBuildTerminal}
      />

      <div className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-4 py-3">
        <p className="text-xs text-[var(--hca-ink-muted)]">
          {tr("twins.detail.doingNow")}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">
          {doingNow ?? tr("twins.detail.doingNowEmpty")}
        </p>
        <Link
          href={insightsHref}
          className="mt-2 inline-block text-[13px] text-[var(--hca-accent)] hover:underline"
        >
          {tr("twins.detail.openInsights")}
        </Link>
      </div>

      <AuthorIdsTable ids={ids as Record<string, string | null | undefined>} />

      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">{tr("twins.detail.career")}</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        <CareerTimeline career={twin.career} />
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">{tr("twins.detail.research")}</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        {themes.length === 0 && pubs.length === 0 ? (
          <p className="text-sm text-[var(--hca-ink-muted)]">
            {tr("twins.detail.researchEmpty")}
          </p>
        ) : (
          <div className="space-y-3">
            {themes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {themes.map((t) => (
                  <span
                    key={t}
                    className="rounded-[var(--radius-sm)] bg-[var(--hca-accent-soft)] px-2 py-0.5 text-xs"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <ul className="space-y-2">
              {pubs.slice(0, 8).map((p, i) => (
                <li key={`${p.title}-${i}`} className="text-sm">
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--hca-accent)] underline-offset-2 hover:underline"
                    >
                      {p.title ?? "Untitled"}
                    </a>
                  ) : (
                    <span>{p.title ?? "Untitled"}</span>
                  )}
                  {p.year != null ? (
                    <span className="ml-2 font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
                      {p.year}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">{tr("twins.detail.heatmap")}</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        {activity?.last_polled_at ? (
          <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
            last_polled_at {activity.last_polled_at}
          </p>
        ) : null}
        {activity?.windows ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {HEATMAP_WINDOWS.map(([key, labelKey]) => {
              const w = activity.windows?.[key];
              return (
                <div
                  key={key}
                  className="rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
                >
                  <p className="text-[11px] text-[var(--hca-ink-muted)]">
                    {tr(labelKey)}
                  </p>
                  <p className="mt-1 text-sm">
                    {w?.no_public_evidence
                      ? tr("common.noPublicEvidence")
                      : tr("common.eventCount", {
                          n: String(w?.event_count ?? 0),
                        })}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--hca-ink-muted)]">
            {tr("twins.detail.heatmapEmpty")}
          </p>
        )}
        {activity?.events && activity.events.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {activity.events.slice(0, 5).map((e, i) => (
              <li key={`${e.name}-${i}`} className="text-[13px]">
                <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
                  {e.date ?? "—"}
                </span>{" "}
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
        ) : null}
      </section>
    </div>
  );
}
