"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShellTab } from "@/components/ShellTab";
import { t } from "@/i18n";
import {
  isTwinEditPath,
  shellTwinIdFromPath,
  surnameAbbrev,
  twinIdFromPath,
  useHcpContext,
} from "@/store/hcp-context";

function useHcpContextHydrated() {
  const openTwins = useHcpContext((s) => s.openTwins);
  const locale = useHcpContext((s) => s.locale);
  const closeTwin = useHcpContext((s) => s.closeTwin);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return {
      openTwins: [] as { hcpId: string; name: string }[],
      locale: "zh-CN" as const,
      closeTwin,
      hydrated: false,
    };
  }
  return { openTwins, locale, closeTwin, hydrated: true };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openTwins, locale, closeTwin } = useHcpContextHydrated();
  const wide = pathname.startsWith("/agent");

  const activeTwinId = shellTwinIdFromPath(pathname);
  const showSpecimen =
    twinIdFromPath(pathname) != null && !isTwinEditPath(pathname);
  const activeTwin = showSpecimen
    ? openTwins.find((t) => t.hcpId === activeTwinId)
    : null;
  const abbrev = showSpecimen ? surnameAbbrev(activeTwin?.name) : "—";

  const handleCloseTwin = (hcpId: string) => {
    const isCurrent = shellTwinIdFromPath(pathname) === hcpId;
    const remaining = openTwins.filter((t) => t.hcpId !== hcpId);
    closeTwin(hcpId);
    if (isCurrent) {
      if (remaining.length > 0) {
        const last = remaining[remaining.length - 1];
        router.push(`/twins/${encodeURIComponent(last.hcpId)}`);
      } else {
        router.push("/twins");
      }
    }
  };

  const listActive =
    pathname === "/twins" ||
    pathname === "/twins/" ||
    pathname === "/twins/new" ||
    pathname.startsWith("/twins/new/");
  const agentActive =
    pathname === "/agent" || pathname.startsWith("/agent/");

  return (
    <div className="flex min-h-screen bg-[var(--hca-bg)] text-[var(--hca-ink)]">
      <aside
        className="flex w-8 shrink-0 flex-col items-center gap-3 border-r border-[var(--hca-line)] bg-[var(--hca-accent-soft)] pt-6"
        aria-label="标本索引"
      >
        <span
          className="text-[13px] font-semibold tracking-[0.12em] text-[var(--hca-ink)]"
          style={{ writingMode: "vertical-rl" }}
        >
          {abbrev}
        </span>
        <span
          className="h-1.5 w-1.5 rounded-full border border-[var(--hca-ink)] bg-transparent"
          title={showSpecimen ? "已打开 HCP 工作台" : "未聚焦 HCP"}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--hca-line)] bg-[var(--hca-surface)] px-6 py-3">
          <p className="text-[13px] font-medium tracking-[0.02em] text-[var(--hca-ink)]">
            hcp engagement
          </p>
          <span className="text-xs text-[var(--hca-ink-muted)]">·</span>
          <nav className="flex flex-wrap items-center gap-1" aria-label="主导航">
            <ShellTab
              tabKey="shell-list"
              label={t(locale, "shell.list")}
              href="/twins"
              active={listActive}
            />
            {openTwins.map((twin) => (
              <ShellTab
                key={twin.hcpId}
                tabKey={`shell-twin-${twin.hcpId}`}
                label={twin.name}
                href={`/twins/${encodeURIComponent(twin.hcpId)}`}
                active={activeTwinId === twin.hcpId}
                closable
                onClose={() => handleCloseTwin(twin.hcpId)}
              />
            ))}
            <ShellTab
              tabKey="shell-agent"
              label={t(locale, "shell.agent")}
              href="/agent"
              active={agentActive}
            />
          </nav>
          <span className="ml-auto font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
            mvp-1 · 6.ui-guideline
          </span>
        </header>

        <main
          className={`w-full flex-1 px-7 pb-10 pt-6 ${wide ? "max-w-[1280px]" : "max-w-[1120px]"}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
