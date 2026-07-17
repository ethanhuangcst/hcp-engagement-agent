"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TagBadges } from "@/components/TagBadges";
import { useHcpContext } from "@/store/hcp-context";
import type { HcpTags } from "@hca/domain";

type TwinRow = {
  hcp_id: string;
  name_zh: string;
  hospital: string;
  department: string;
  as_of: string | null;
  tags: HcpTags | null;
  doing_now?: string;
};

export default function TwinsListPage() {
  const [items, setItems] = useState<TwinRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const setSelected = useHcpContext((s) => s.setSelected);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/twins");
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "加载列表失败");
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 列表 ≠ 选定分身：清空持久化上下文，避免 Specimen / 洞察 Tab 残留
    setSelected(null);
    void load();
  }, [setSelected]);

  const pending = pendingDeleteId
    ? items.find((t) => t.hcp_id === pendingDeleteId)
    : null;

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const res = await fetch(
      `/api/twins/${encodeURIComponent(pendingDeleteId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json();
      setError(data?.error?.message ?? "删除失败");
      return;
    }
    const ctx = useHcpContext.getState();
    if (ctx.selectedHcpId === pendingDeleteId) ctx.setSelected(null);
    setPendingDeleteId(null);
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-xs text-[var(--hca-ink-muted)]">数字分身</p>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight">
            HCP 数字分身列表
          </h1>
          <p className="text-sm text-[var(--hca-ink-muted)]">
            {loading
              ? "加载中…"
              : `共 ${items.length} 位医生分身 · 每一行是一位独立 HCP`}
          </p>
        </div>
        <Link href="/twins/new" className="hca-btn-primary">
          新增数字分身
        </Link>
      </div>

      {error && (
        <p className="text-sm text-[var(--hca-danger)]" role="alert">
          {error}
        </p>
      )}

      {pending && (
        <div className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-4 py-3">
          <p className="text-sm">
            确认删除「{pending.name_zh}」？删除后不可从列表恢复，洞察与一人一策将收回。
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              className="hca-btn-primary"
              onClick={() => void confirmDelete()}
            >
              确认删除
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--hca-ink-muted)] hover:bg-[var(--hca-accent-soft)]"
              onClick={() => setPendingDeleteId(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)]">
        <div className="hidden grid-cols-[48px_1fr_200px_100px] gap-3 border-b border-[var(--hca-line)] bg-[var(--hca-accent-soft)] px-4 py-2.5 text-[11px] text-[var(--hca-ink-muted)] md:grid">
          <span className="font-[family-name:var(--font-mono)]">#</span>
          <span>医生 / 机构 / 一句话洞察</span>
          <span>级别标签</span>
          <span>操作</span>
        </div>

        {!loading && items.length === 0 && (
          <div className="px-6 py-6 text-sm text-[var(--hca-ink-muted)]">
            尚无分身。点击「新增数字分身」开始构建。
          </div>
        )}

        {items.map((row, i) => (
          <div
            key={row.hcp_id}
            className={`grid grid-cols-[40px_1fr] items-start gap-3 border-l-[3px] border-l-[var(--hca-accent)] px-4 py-4 md:grid-cols-[48px_1fr_200px_100px] ${
              i < items.length - 1 ? "border-b border-[var(--hca-line)]" : ""
            }`}
          >
            <span className="font-[family-name:var(--font-mono)] text-lg font-semibold leading-tight text-[var(--hca-ink-muted)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-start gap-2">
                <span className="text-[17px] font-semibold">
                  {row.name_zh}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
                  hcp:{row.hcp_id}
                </span>
              </div>
              <p className="text-[13px] text-[var(--hca-ink-muted)]">
                {row.hospital}
              </p>
              <p className="text-xs text-[var(--hca-ink-muted)]">
                {row.department}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed">
                {row.doing_now ?? "—"}
              </p>
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
                as_of {row.as_of ?? "—"}
              </p>
            </div>
            <div className="col-span-2 flex flex-wrap items-start justify-between gap-3 md:col-span-1 md:contents">
              <div className="md:contents">
                <TagBadges tags={row.tags} />
              </div>
              <div className="flex flex-row gap-1.5 md:flex-col">
                <Link
                  href={`/twins/${encodeURIComponent(row.hcp_id)}`}
                  className="hca-btn-primary px-2 py-1.5"
                >
                  打开
                </Link>
                <Link
                  href={`/twins/${encodeURIComponent(row.hcp_id)}/edit`}
                  className="rounded-[var(--radius-md)] border border-[var(--hca-line)] px-2 py-1.5 text-center text-sm"
                >
                  修改
                </Link>
                <button
                  type="button"
                  className="rounded-[var(--radius-md)] px-2 py-1.5 text-sm text-[var(--hca-ink-muted)] hover:bg-[var(--hca-accent-soft)]"
                  onClick={() => setPendingDeleteId(row.hcp_id)}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
