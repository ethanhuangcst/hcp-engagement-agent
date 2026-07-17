"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [items, setItems] = useState<TwinRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const openTwin = useHcpContext((s) => s.openTwin);

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
    void load();
  }, []);

  const onOpen = (row: TwinRow) => {
    openTwin(row.hcp_id, row.name_zh);
    router.push(`/twins/${encodeURIComponent(row.hcp_id)}`);
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
                <button
                  type="button"
                  className="hca-btn-primary px-2 py-1.5"
                  onClick={() => onOpen(row)}
                >
                  打开
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
