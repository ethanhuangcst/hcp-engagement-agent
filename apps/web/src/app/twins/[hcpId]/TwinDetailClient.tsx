"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthorIdsTable } from "@/components/AuthorIdsTable";
import { BackNavBar } from "@/components/BackNavBar";
import { BuildProgress } from "@/components/BuildProgress";
import { CareerTimeline } from "@/components/CareerTimeline";
import { TagBadges } from "@/components/TagBadges";
import { useHcpContext } from "@/store/hcp-context";
import type { VirtualTwin } from "@hca/domain";

type Insights = {
  doing_now?: { summary?: string; analysis?: string } | string;
};

export default function TwinDetailClient() {
  const params = useParams<{ hcpId: string }>();
  const router = useRouter();
  const hcpId = decodeURIComponent(params.hcpId);
  const { setSelected } = useHcpContext();
  const [twin, setTwin] = useState<VirtualTwin | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const reload = useCallback(async () => {
    const [tRes, iRes] = await Promise.all([
      fetch(`/api/twins/${encodeURIComponent(hcpId)}`),
      fetch(`/api/insights/${encodeURIComponent(hcpId)}`),
    ]);
    const tData = await tRes.json();
    if (!tRes.ok) {
      setError(tData?.error?.message ?? "加载失败");
      return;
    }
    setTwin(tData.twin);
    setSelected(hcpId, tData.twin?.profile?.name_zh);
    if (iRes.ok) {
      const iData = await iRes.json();
      setInsights(iData.insights);
    }
  }, [hcpId, setSelected]);

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
        setError(data?.error?.message ?? "启动构建失败");
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
      if (phase === "done") void reload();
      if (phase === "error") {
        setError("情报构建失败，见进度区详情");
      }
    },
    [reload],
  );

  const onDelete = async () => {
    const res = await fetch(`/api/twins/${encodeURIComponent(hcpId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data?.error?.message ?? "删除失败");
      return;
    }
    setSelected(null);
    router.push("/twins");
  };

  const doingNow =
    typeof insights?.doing_now === "string"
      ? insights.doing_now
      : insights?.doing_now?.summary;

  if (error && !twin) {
    return (
      <p className="text-sm text-[var(--hca-danger)]" role="alert">
        {error}
      </p>
    );
  }
  if (!twin) {
    return <p className="text-sm text-[var(--hca-ink-muted)]">加载中…</p>;
  }

  const ids =
    twin.research?.author_ids ?? twin.profile.external_ids ?? undefined;
  const themes = (twin.research?.themes as string[] | undefined) ?? [];
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

  return (
    <div className="space-y-6">
      <BackNavBar
        label="返回列表"
        href="/twins"
        actions={
          <>
            <button
              type="button"
              className="hca-btn-primary px-3 py-1.5"
              disabled={building}
              onClick={() => void onBuild()}
            >
              {building ? "构建中…" : "构建情报"}
            </button>
            <Link
              href={`/twins/${encodeURIComponent(hcpId)}/edit`}
              className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-3 py-1.5 text-sm"
            >
              修改
            </Link>
            <button
              type="button"
              onClick={() => setPendingDelete(true)}
              className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--hca-ink-muted)] hover:bg-[var(--hca-surface)]"
            >
              删除
            </button>
          </>
        }
      />

      {error ? (
        <p className="text-sm text-[var(--hca-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {pendingDelete && (
        <div className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-4 py-3">
          <p className="text-sm">
            确认删除「{twin.profile.name_zh}」？删除后不可从列表恢复。
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              className="hca-btn-primary"
              onClick={() => void onDelete()}
            >
              确认删除
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--hca-ink-muted)]"
              onClick={() => setPendingDelete(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight">
          {twin.profile.name_zh}
        </h1>
        <TagBadges tags={twin.profile.tags} />
        <p className="text-[13px] text-[var(--hca-ink-muted)]">
          {twin.profile.hospital} · {twin.profile.department}
          {twin.profile.title ? ` · ${twin.profile.title}` : ""}
        </p>
        <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
          hcp:{twin.meta.hcp_id} · as_of {twin.meta.as_of}
          {twin.meta.build_mode ? ` · build ${twin.meta.build_mode}` : ""}
        </p>
      </div>

      {runId ? (
        <section className="space-y-2 rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-4 py-3">
          <h2 className="text-sm font-medium">情报构建</h2>
          <BuildProgress
            hcpId={hcpId}
            runId={runId}
            onTerminal={onBuildTerminal}
          />
          {!building ? (
            <button
              type="button"
              className="text-sm text-[var(--hca-ink-muted)] underline"
              onClick={() => {
                setRunId(null);
                setError(null);
              }}
            >
              收起进度
            </button>
          ) : null}
        </section>
      ) : null}

      <div className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-4 py-3">
        <p className="text-xs text-[var(--hca-ink-muted)]">一句话洞察</p>
        <p className="mt-1.5 text-sm leading-relaxed">
          {doingNow ??
            "尚未写入洞察草稿。点击「构建情报」跑 Stage A–E（live）后可见。"}
        </p>
      </div>

      <AuthorIdsTable ids={ids as Record<string, string | null | undefined>} />

      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">职业轨迹</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        <CareerTimeline career={twin.career} />
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-medium">科研动向</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        {themes.length === 0 && pubs.length === 0 ? (
          <p className="text-sm text-[var(--hca-ink-muted)]">
            暂无科研主题/论文。构建情报后由 OpenAlex 等公开源写入。
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
        <h2 className="text-lg font-medium">活动热力</h2>
        <div className="h-px bg-[var(--hca-line)]" />
        {activity?.last_polled_at ? (
          <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
            last_polled_at {activity.last_polled_at}
          </p>
        ) : null}
        {activity?.windows ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {(
              [
                ["earlier", "更早"],
                ["d90", "90天"],
                ["d60", "60天"],
                ["d30", "30天"],
              ] as const
            ).map(([key, label]) => {
              const w = activity.windows?.[key];
              return (
                <div
                  key={key}
                  className="rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
                >
                  <p className="text-[11px] text-[var(--hca-ink-muted)]">
                    {label}
                  </p>
                  <p className="mt-1 text-sm">
                    {w?.no_public_evidence
                      ? "无公开证据"
                      : `${w?.event_count ?? 0} 条`}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--hca-ink-muted)]">
            暂无热力窗。构建情报后由 ClinicalTrials.gov 等公开源写入。
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
