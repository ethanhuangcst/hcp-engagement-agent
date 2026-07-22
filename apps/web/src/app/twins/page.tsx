"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HcpNameHeading } from "@/components/HcpNameHeading";
import { TagBadges } from "@/components/TagBadges";
import { useLocale, useT } from "@/i18n";
import { useHcpContext } from "@/store/hcp-context";
import type { HcpTags } from "@hca/domain";

type TwinRow = {
  hcp_id: string;
  name_zh: string;
  name_en?: string | null;
  hospital: string;
  department: string;
  as_of: string | null;
  tags: HcpTags | null;
  doing_now?: string;
  doing_now_by_locale?: { "zh-CN"?: string; en?: string };
};

export default function TwinsListPage() {
  const router = useRouter();
  const tr = useT();
  const locale = useLocale();
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
        setError(data?.error?.message ?? tr("twins.list.loadFailed"));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load
  }, []);

  const onOpen = (row: TwinRow) => {
    openTwin(row.hcp_id, row.name_zh, row.name_en);
    router.push(`/twins/${encodeURIComponent(row.hcp_id)}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight">
            {tr("twins.list.title")}
          </h1>
          <p className="text-sm text-[var(--hca-ink-muted)]">
            {loading
              ? tr("common.loading")
              : tr("twins.list.count", { n: String(items.length) })}
          </p>
        </div>
        <Link href="/twins/new" className="hca-btn-primary">
          {tr("twins.list.add")}
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
          <span>{tr("twins.list.col.doctor")}</span>
          <span>{tr("twins.list.col.tags")}</span>
          <span>{tr("twins.list.col.action")}</span>
        </div>

        {!loading && items.length === 0 && (
          <div className="px-6 py-6 text-sm text-[var(--hca-ink-muted)]">
            {tr("twins.list.empty")}
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
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <HcpNameHeading
                  as="span"
                  className="text-[17px] font-semibold leading-snug"
                  nameZh={row.name_zh}
                  nameEn={row.name_en}
                />
                <span className="font-[family-name:var(--font-mono)] text-[11px] leading-snug text-[var(--hca-ink-muted)]">
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
                {(locale === "en"
                  ? row.doing_now_by_locale?.en
                  : row.doing_now_by_locale?.["zh-CN"]) ??
                  (locale === "zh-CN" ? row.doing_now : undefined) ??
                  "—"}
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
                  {tr("twins.list.open")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
