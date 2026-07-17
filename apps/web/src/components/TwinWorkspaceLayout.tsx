"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/i18n";
import { useHcpContext } from "@/store/hcp-context";

const WORKSPACE_TABS = [
  { segment: "", key: "workspace.tab.profile" as const },
  { segment: "insights", key: "workspace.tab.insights" as const },
  { segment: "options", key: "workspace.tab.options" as const },
] as const;

export function TwinWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ hcpId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const hcpId = decodeURIComponent(params.hcpId);
  const locale = useHcpContext((s) => s.locale);
  const openTwin = useHcpContext((s) => s.openTwin);
  const closeTwin = useHcpContext((s) => s.closeTwin);

  const [displayName, setDisplayName] = useState<string>(() => {
    const cached = useHcpContext
      .getState()
      .openTwins.find((t) => t.hcpId === hcpId);
    return cached?.name ?? "";
  });
  const [pendingDelete, setPendingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncTwin = useCallback(async () => {
    const res = await fetch(`/api/twins/${encodeURIComponent(hcpId)}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error?.message ?? "加载失败");
      return;
    }
    const name = data.twin?.profile?.name_zh ?? hcpId;
    setDisplayName(name);
    openTwin(hcpId, name);
  }, [hcpId, openTwin]);

  useEffect(() => {
    void syncTwin();
  }, [syncTwin]);

  const base = `/twins/${encodeURIComponent(hcpId)}`;
  const activeSegment = pathname.startsWith(`${base}/insights`)
    ? "insights"
    : pathname.startsWith(`${base}/options`)
      ? "options"
      : "";

  const onClosePage = () => {
    closeTwin(hcpId);
    const remaining = useHcpContext
      .getState()
      .openTwins.filter((t) => t.hcpId !== hcpId);
    if (remaining.length > 0) {
      router.push(`/twins/${encodeURIComponent(remaining[remaining.length - 1].hcpId)}`);
    } else {
      router.push("/twins");
    }
  };

  const onDelete = async () => {
    const res = await fetch(`/api/twins/${encodeURIComponent(hcpId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data?.error?.message ?? "删除失败");
      return;
    }
    closeTwin(hcpId);
    router.push("/twins");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hca-line)] pb-3">
        <nav
          className="flex flex-wrap items-center gap-1"
          aria-label="分身工作台"
        >
          {WORKSPACE_TABS.map((tab) => {
            const href = tab.segment ? `${base}/${tab.segment}` : base;
            const active = activeSegment === tab.segment;
            return (
              <Link
                key={tab.segment || "profile"}
                href={href}
                aria-current={active ? "page" : undefined}
                className={active ? "hca-tab hca-tab-active" : "hca-tab"}
              >
                {t(locale, tab.key)}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`${base}/edit`}
            className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-3 py-1.5 text-sm"
          >
            {t(locale, "workspace.action.edit")}
          </Link>
          <button
            type="button"
            onClick={() => setPendingDelete(true)}
            className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--hca-ink-muted)] hover:bg-[var(--hca-accent-soft)]"
          >
            {t(locale, "workspace.action.delete")}
          </button>
          <button
            type="button"
            onClick={onClosePage}
            className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--hca-ink-muted)] hover:bg-[var(--hca-accent-soft)]"
          >
            {t(locale, "workspace.action.close")}
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-[var(--hca-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {pendingDelete ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-4 py-3">
          <p className="text-sm">
            {t(locale, "workspace.delete.confirm", {
              name: displayName || hcpId,
            })}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              className="hca-btn-primary"
              onClick={() => void onDelete()}
            >
              {t(locale, "workspace.delete.submit")}
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--hca-ink-muted)] hover:bg-[var(--hca-accent-soft)]"
              onClick={() => setPendingDelete(false)}
            >
              {t(locale, "workspace.delete.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {children}
    </div>
  );
}
