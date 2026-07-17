"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthorIdsTable } from "@/components/AuthorIdsTable";
import { TagBadges } from "@/components/TagBadges";
import { useHcpContext } from "@/store/hcp-context";
import type { VirtualTwin } from "@hca/domain";

type DoingNow = {
  summary?: string;
  analysis?: string;
  as_of?: string;
  confidence?: string;
};

type Insights = {
  hcp_id?: string;
  as_of?: string;
  doing_now?: DoingNow | string;
  interest_directions?: Array<{
    title?: string;
    analysis?: string;
    confidence?: string;
    bucket?: string;
    compliance_note?: string;
  }>;
  opportunities?:
    | Array<{
        title?: string;
        priority?: string;
        note?: string;
        owner?: string;
        channel?: string;
      }>
    | { items?: Array<Record<string, unknown>> };
  evidence?: Array<{
    kind?: string;
    name?: string;
    source_url?: string;
    url?: string;
    source_type?: string;
    confidence?: string;
    as_of?: string;
  }>;
};

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

function asDoingNow(raw: Insights["doing_now"]): DoingNow | null {
  if (!raw) return null;
  if (typeof raw === "string") return { summary: raw };
  return raw;
}

/** 内部 kind → 可读来源名（避免 UI 露出 stage_e_draft 等代码） */
function evidenceLabel(
  e: NonNullable<Insights["evidence"]>[number],
  index: number,
): string {
  if (e.name?.trim()) return e.name.trim();
  const kind = (e.kind ?? e.source_type ?? "").toLowerCase();
  const map: Record<string, string> = {
    stage_e_draft: "情报构建 · 洞察草稿（规则派生）",
    derived: "情报构建 · 洞察草稿（规则派生）",
    openalex: "OpenAlex 作者/作品",
    publication: "公开论文",
    pubmed: "PubMed",
    orcid: "ORCID",
    clinicaltrials: "ClinicalTrials.gov",
    hospital: "医院公开页",
  };
  if (kind && map[kind]) return map[kind];
  if (e.kind?.trim()) return e.kind.trim();
  if (e.source_type?.trim()) return e.source_type.trim();
  return `证据 ${index + 1}`;
}

function confidenceLabel(raw?: string): string {
  if (!raw || raw === "—") return "中";
  const m: Record<string, string> = {
    high: "高",
    medium: "中",
    low: "低",
  };
  return m[raw.toLowerCase()] ?? raw;
}

function opportunityList(insights: Insights | null) {
  const o = insights?.opportunities;
  if (!o) return [];
  if (Array.isArray(o)) return o;
  if (Array.isArray(o.items)) return o.items as Array<{
    title?: string;
    priority?: string;
    note?: string;
    owner?: string;
    channel?: string;
  }>;
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
  // 无分窗事件时：整表用全局 events 仅填「更早」以外为空诚实态
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
        setError(data?.error?.message ?? "加载洞察失败");
        setTwin(null);
        setInsights(null);
        return;
      }
      setTwin(data.twin);
      setInsights(data.insights);
      if (data.twin?.profile?.name_zh) {
        openTwin(hcpId, data.twin.profile.name_zh);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [hcpId, openTwin]);

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
        body: JSON.stringify({ hcpId, refresh }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "合成一句话洞察失败");
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
    setExportNote("已切换打印友好视图：隐藏导航，保留表与正文。请使用浏览器打印/另存 PDF。");
    window.setTimeout(() => window.print(), 100);
  };

  if (!hcpId) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-[var(--hca-ink-muted)]">HCP 洞察</p>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium">
          未选定 HCP
        </h1>
        <p className="text-sm text-[var(--hca-ink-muted)]">
          请先在「HCP数字分身」列表打开一位医生，再进入工作台「HCP洞察」子 Tab。
        </p>
        <Link href="/twins" className="text-sm text-[var(--hca-accent)] underline">
          前往数字分身列表
        </Link>
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-[var(--hca-ink-muted)]">加载洞察…</p>;
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
        未找到分身数据（hcp:{hcpId}）
      </p>
    );
  }

  const doing = asDoingNow(insights?.doing_now);
  const themes = (twin.research?.themes as string[] | undefined) ?? [];
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
  const interests = insights?.interest_directions ?? [];
  const opps = opportunityList(insights);
  const evidence = insights?.evidence ?? [];
  const d90 = windowEvents(activity, "d90");
  const heatCols = [
    { key: "earlier", label: "更早" },
    { key: "d90", label: "90天" },
    { key: "d60", label: "60天" },
    { key: "d30", label: "30天" },
  ] as const;

  const knownEvents = (activity?.events ?? []).slice(0, 8);
  const tier = twin.profile.tags?.hcp_tier ?? "—";

  return (
    <div className="hca-insights-print space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs text-[var(--hca-ink-muted)]">HCP 洞察</p>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight">
            {twin.profile.name_zh || selectedName}
          </h1>
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
              {synthBusy ? "合成中…" : "合成一句话洞察"}
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-3 py-1.5 text-sm"
              disabled={synthBusy}
              onClick={() => void onSynthesize(true)}
            >
              强制刷新
            </button>
            <button
              type="button"
              className="hca-btn-primary px-3 py-1.5"
              onClick={onExport}
            >
              导出
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
        <p className="text-xs text-[var(--hca-ink-muted)]">一句话洞察</p>
        <p className="mt-1.5 text-sm leading-relaxed">
          {doing?.summary ??
            "尚未生成。可点击「合成一句话洞察」（无 LLM Key 时走规则合成）。"}
        </p>
        {doing?.analysis ? (
          <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--hca-ink-muted)]">
            分析：{doing.analysis}
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
          <p className="text-xs text-[var(--hca-ink-muted)]">科研方向</p>
        </div>
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl">
            {d90.empty ? "0" : String(d90.items.length || activity?.windows?.d90?.event_count || 0)}
          </p>
          <p className="text-xs text-[var(--hca-ink-muted)]">近 90 日公开会务</p>
        </div>
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl">
            {tier}
          </p>
          <p className="text-xs text-[var(--hca-ink-muted)]">级别主标</p>
        </div>
      </div>

      {/* F-WEB-019 */}
      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">科研方向</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        {themes.length === 0 ? (
          <p className="text-sm text-[var(--hca-ink-muted)]">
            暂无科研主题。可在数字分身详情触发「构建情报」后重试。
          </p>
        ) : (
          <div className="space-y-4">
            {themes.map((theme) => {
              const related = pubs.filter((p) =>
                (p.title ?? "").toLowerCase().includes(theme.toLowerCase().slice(0, 4)),
              );
              const fallback = related.length ? related : pubs.slice(0, 2);
              return (
                <div key={theme}>
                  <h3 className="text-[15px] font-medium">{theme}</h3>
                  <ul className="mt-2 space-y-1.5">
                    {fallback.length === 0 ? (
                      <li className="text-[13px] text-[var(--hca-ink-muted)]">
                        暂无挂靠著作链接
                      </li>
                    ) : (
                      fallback.map((p, i) => (
                        <li key={`${theme}-${i}`} className="text-[13px]">
                          <span className="mr-2 text-[11px] text-[var(--hca-ink-muted)]">
                            著作
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
        <h2 className="text-lg font-medium">活动热力</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        <p className="text-xs text-[var(--hca-ink-muted)]">
          日期 · 地点 · 名称（链接）· 空窗不绘假高峰
          {activity?.last_polled_at
            ? ` · last_polled_at ${activity.last_polled_at}`
            : ""}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr>
                {heatCols.map((c) => (
                  <th
                    key={c.key}
                    className="border-b border-[var(--hca-line)] px-3 py-2.5 text-left font-medium text-[var(--hca-ink-muted)]"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {heatCols.map((c) => {
                  const cell = windowEvents(activity, c.key);
                  return (
                    <td
                      key={c.key}
                      className="min-w-[140px] border-b border-[var(--hca-line)] px-3 py-3 align-top"
                    >
                      {cell.empty || cell.items.length === 0 ? (
                        <span className="text-[var(--hca-ink-muted)]">
                          无公开证据
                        </span>
                      ) : (
                        <ul className="space-y-2">
                          {cell.items.map((e, i) => (
                            <li key={`${c.key}-${i}`}>
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
        <h2 className="text-lg font-medium">已知近期学术活动</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        {knownEvents.length === 0 ? (
          <p className="text-sm text-[var(--hca-ink-muted)]">
            暂无公开活动条目（不捏造会务高峰）。
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
          <h2 className="text-lg font-medium">兴趣方向</h2>
          <div className="h-px bg-[var(--hca-line)]" />
          {interests.length === 0 ? (
            <p className="text-sm text-[var(--hca-ink-muted)]">
              暂无兴趣轴。构建情报或合成洞察后可见。
            </p>
          ) : (
            <ol className="space-y-3">
              {interests.map((it, i) => (
                <li key={`${it.title}-${i}`} className="space-y-1">
                  <p className="text-[13px] font-medium">
                    {i + 1}. {it.title ?? "未命名方向"}
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
                      （待补充分析说明）
                    </p>
                  )}
                  {it.compliance_note ? (
                    <p className="text-[11px] text-[var(--hca-ink-muted)]">
                      合规旁注：{it.compliance_note}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="space-y-2.5">
          <h2 className="text-lg font-medium">可能的机会</h2>
          <div className="h-px bg-[var(--hca-line)]" />
          {opps.length === 0 ? (
            <p className="text-sm text-[var(--hca-ink-muted)]">
              暂无机会条目。不假设处方或进院意愿。
            </p>
          ) : (
            <ul className="space-y-3">
              {opps.map((o, i) => (
                <li key={`${o.title}-${i}`} className="space-y-1">
                  <p className="text-[13px] font-medium">
                    {o.title ?? `机会 ${i + 1}`}
                    {o.priority ? (
                      <span className="ml-2 text-[11px] font-normal text-[var(--hca-ink-muted)]">
                        优先级 {o.priority}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[13px] leading-relaxed text-[var(--hca-ink-muted)]">
                    {o.note ?? "—"}
                    {o.owner || o.channel
                      ? ` · 建议 ${[o.owner, o.channel].filter(Boolean).join(" / ")}`
                      : ""}
                  </p>
                  <p className="text-[11px] text-[var(--hca-ink-muted)]">
                    不假设：处方偏好、进院意愿、特定产品合作意向
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* F-WEB-024 */}
      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">证据与来源</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        {evidence.length === 0 ? (
          <p className="text-sm text-[var(--hca-ink-muted)]">
            暂无独立证据表。文献号与论文链接见上文 AuthorIds / 科研方向。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["来源", "置信", "as_of"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-[var(--hca-line)] px-3 py-2 text-left font-medium text-[var(--hca-ink-muted)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidence.map((e, i) => {
                  const href = e.source_url || e.url;
                  const label = evidenceLabel(e, i);
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
                        {confidenceLabel(e.confidence)}
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
