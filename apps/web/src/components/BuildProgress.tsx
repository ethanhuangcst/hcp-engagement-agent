"use client";

import { useEffect, useState } from "react";

type Status = {
  phase: string;
  progress: number;
  message: string;
  runId?: string;
  error?: { message?: string };
};

/** 对齐 MCP Stage A–E（F-WEB-014） */
const BUILD_STAGES = [
  { key: "identity", label: "身份锁定" },
  { key: "career", label: "职业轨迹" },
  { key: "research", label: "科研动向" },
  { key: "heatmap", label: "活动热力" },
  { key: "insights", label: "洞察草稿" },
] as const;

function stageIndexFromStatus(status: Status): number {
  const p = status.phase.toLowerCase();
  if (p === "done") return BUILD_STAGES.length;
  if (p === "error" || p === "queued") return 0;
  const idx = BUILD_STAGES.findIndex((s) => s.key === p);
  return idx >= 0 ? idx : 0;
}

export function BuildProgress({
  hcpId,
  runId,
  onTerminal,
}: {
  hcpId: string;
  runId: string;
  onTerminal?: (phase: "done" | "error") => void;
}) {
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
      <p className="text-sm text-[var(--hca-ink-muted)]">等待构建进度…</p>
    );
  }

  const stageIndex = stageIndexFromStatus(status);
  const failed = status.phase === "error";

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--hca-ink-muted)]">
        Twin 构建进度 · {status.message}
        {typeof status.progress === "number"
          ? `（${Math.round(status.progress * 100)}%）`
          : ""}
      </p>
      {failed && status.error?.message ? (
        <p className="text-sm text-[var(--hca-danger)]" role="alert">
          {status.error.message}
        </p>
      ) : null}
      <div className="space-y-2">
        {BUILD_STAGES.map((stage, i) => {
          const done = !failed && i < stageIndex;
          const current =
            !failed && i === stageIndex && status.phase !== "done";
          return (
            <div
              key={stage.key}
              className={`border-l-2 px-3 py-2.5 text-[13px] ${
                current || done
                  ? "border-[var(--hca-accent)]"
                  : "border-[var(--hca-line)]"
              } ${current ? "bg-[var(--hca-accent-soft)]" : "bg-transparent"}`}
            >
              {done ? "完成" : current ? "进行中" : failed ? "中断" : "等待"} ·{" "}
              {stage.label}
            </div>
          );
        })}
      </div>
      <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
        runId:{runId}
      </p>
    </div>
  );
}
