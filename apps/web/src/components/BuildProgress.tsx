"use client";

import { useEffect, useState } from "react";
import type { VirtualTwin } from "@hca/domain";
import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n/types";

type Status = {
  phase: string;
  progress: number;
  message: string;
  runId?: string;
  error?: { message?: string };
};

/** 对齐 MCP Stage A–E（F-WEB-014） */
const BUILD_STAGES = [
  { key: "identity", labelKey: "build.stage.identity" },
  { key: "career", labelKey: "build.stage.career" },
  { key: "research", labelKey: "build.stage.research" },
  { key: "heatmap", labelKey: "build.stage.heatmap" },
  { key: "insights", labelKey: "build.stage.insights" },
] as const satisfies ReadonlyArray<{ key: string; labelKey: MessageKey }>;

/** 是否已有入库的情报构建结果（非仅身份草稿） */
export function hasBuiltIntelligence(twin: VirtualTwin | null | undefined): boolean {
  if (!twin) return false;
  if (twin.meta.built_at) return true;
  const themes = twin.research?.themes;
  const pubs = twin.research?.recent_pubs;
  const polled = (
    twin.activity as { last_polled_at?: string } | undefined
  )?.last_polled_at;
  return Boolean(
    (Array.isArray(themes) && themes.length > 0) ||
      (Array.isArray(pubs) && pubs.length > 0) ||
      polled,
  );
}

function stageIndexFromStatus(status: Status): number {
  const p = status.phase.toLowerCase();
  if (p === "done") return BUILD_STAGES.length;
  if (p === "error" || p === "queued") return 0;
  const idx = BUILD_STAGES.findIndex((s) => s.key === p);
  return idx >= 0 ? idx : 0;
}

function StageList({
  stageIndex,
  failed,
}: {
  stageIndex: number;
  failed: boolean;
}) {
  const tr = useT();
  return (
    <div className="space-y-2">
      {BUILD_STAGES.map((stage, i) => {
        const done = !failed && i < stageIndex;
        const current = !failed && i === stageIndex && stageIndex < BUILD_STAGES.length;
        const phaseLabel = done
          ? tr("build.phase.done")
          : current
            ? tr("build.phase.current")
            : failed
              ? tr("build.phase.failed")
              : tr("build.phase.wait");
        return (
          <div
            key={stage.key}
            className={`border-l-2 px-3 py-2.5 text-[13px] ${
              current || done
                ? "border-[var(--hca-accent)]"
                : "border-[var(--hca-line)]"
            } ${current ? "bg-[var(--hca-accent-soft)]" : "bg-transparent"}`}
          >
            {phaseLabel} · {tr(stage.labelKey)}
          </div>
        );
      })}
    </div>
  );
}

function LiveProgress({
  hcpId,
  runId,
  onTerminal,
}: {
  hcpId: string;
  runId: string;
  onTerminal?: (phase: "done" | "error") => void;
}) {
  const tr = useT();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const res = await fetch(
        `/api/twins/${encodeURIComponent(hcpId)}/status?runId=${encodeURIComponent(runId)}`,
      );
      if (!res.ok) {
        if (!cancelled) {
          timer = setTimeout(poll, 1000);
        }
        return;
      }
      const data = (await res.json()) as Status;
      if (cancelled) return;
      setStatus(data);
      if (data.phase === "done" || data.phase === "error") {
        onTerminal?.(data.phase);
        return;
      }
      timer = setTimeout(poll, 800);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hcpId, runId, onTerminal]);

  if (!status) {
    return (
      <p className="text-sm text-[var(--hca-ink-muted)]">{tr("build.waiting")}</p>
    );
  }

  const stageIndex = stageIndexFromStatus(status);
  const failed = status.phase === "error";
  const pct =
    typeof status.progress === "number"
      ? `（${Math.round(status.progress * 100)}%）`
      : "";

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--hca-ink-muted)]">
        {tr("build.statusPrefix", { message: `${status.message}${pct}` })}
      </p>
      {failed && status.error?.message ? (
        <p className="text-sm text-[var(--hca-danger)]" role="alert">
          {status.error.message}
        </p>
      ) : null}
      <StageList stageIndex={stageIndex} failed={failed} />
      <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
        runId:{runId}
      </p>
    </div>
  );
}

/** 常驻「智能体情报构建」面板（F-WEB-014） */
export function IntelligenceBuildPanel({
  hcpId,
  twin,
  runId,
  building,
  onBuild,
  onTerminal,
}: {
  hcpId: string;
  twin: VirtualTwin;
  runId: string | null;
  building: boolean;
  onBuild: () => void;
  onTerminal?: (phase: "done" | "error") => void;
}) {
  const tr = useT();
  const built = hasBuiltIntelligence(twin);
  const buttonLabel = building
    ? tr("build.building")
    : built
      ? tr("build.rebuild")
      : tr("build.cta");

  return (
    <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{tr("build.title")}</h2>
        <button
          type="button"
          className="hca-btn-primary px-3 py-1.5"
          disabled={building}
          onClick={onBuild}
        >
          {buttonLabel}
        </button>
      </div>

      {runId ? (
        <LiveProgress hcpId={hcpId} runId={runId} onTerminal={onTerminal} />
      ) : built ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--hca-ink-muted)]">
            {tr("build.statusDone")}
          </p>
          <StageList stageIndex={BUILD_STAGES.length} failed={false} />
          {twin.meta.built_at ? (
            <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
              built_at:{twin.meta.built_at}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-[var(--hca-ink-muted)]">{tr("build.empty")}</p>
      )}
    </section>
  );
}

/** @deprecated 使用 IntelligenceBuildPanel；保留别名避免旧导入断裂 */
export function BuildProgress(props: {
  hcpId: string;
  runId: string;
  onTerminal?: (phase: "done" | "error") => void;
}) {
  return <LiveProgress {...props} />;
}
