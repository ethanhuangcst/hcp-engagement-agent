"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { surnameAbbrev, useHcpContext } from "@/store/hcp-context";

const TABS = [
  { href: "/twins", label: "数字分身", always: true },
  { href: "/insights", label: "HCP洞察", needsHcp: true },
  { href: "/options", label: "一人一策", needsHcp: true },
  { href: "/agent", label: "HCP Engagement Agent", always: true },
] as const;

/**
 * 列表 / 新增 / 修改：未「打开」分身工作上下文（对齐原型 tabsUnlocked）。
 * 仅详情、洞察、一人一策（及带着已选上下文的 Agent）可展示索引与门禁 Tab。
 */
export function isTwinWorkbenchLocked(pathname: string): boolean {
  if (pathname === "/twins" || pathname === "/twins/") return true;
  if (pathname === "/twins/new" || pathname.startsWith("/twins/new/")) return true;
  if (/^\/twins\/[^/]+\/edit\/?$/.test(pathname)) return true;
  return false;
}

/**
 * persist 的 localStorage 只在客户端有；SSR 与首屏 hydrate 必须用同一快照
 *（未选定 HCP），再在 mounted 后切到真实上下文，避免 Tab / 索引条 mismatch。
 */
function useHcpContextHydrated() {
  const selectedHcpId = useHcpContext((s) => s.selectedHcpId);
  const selectedName = useHcpContext((s) => s.selectedName);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return { selectedHcpId: null, selectedName: null, hydrated: false };
  }
  return { selectedHcpId, selectedName, hydrated: true };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { selectedHcpId, selectedName } = useHcpContextHydrated();
  const locked = isTwinWorkbenchLocked(pathname);
  const hasHcp = Boolean(selectedHcpId) && !locked;
  const abbrev = hasHcp ? surnameAbbrev(selectedName) : "—";
  const wide = pathname.startsWith("/agent");

  return (
    <div className="flex min-h-screen bg-[var(--hca-bg)] text-[var(--hca-ink)]">
      <aside
        className="flex w-8 shrink-0 flex-col items-center gap-3 border-r border-[var(--hca-line)] bg-[var(--hca-accent-soft)] pt-6"
        aria-label="标本索引"
      >
        <span
          className="text-[13px] font-semibold tracking-[0.12em] text-[var(--hca-ink)]"
          style={{ writingMode: "vertical-rl" }}
          aria-hidden={!hasHcp}
        >
          {abbrev}
        </span>
        <span
          className="h-1.5 w-1.5 rounded-full border border-[var(--hca-ink)] bg-transparent"
          title={hasHcp ? "已选定 HCP" : "未选定 HCP"}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--hca-line)] bg-[var(--hca-surface)] px-6 py-3">
          <p className="text-[13px] font-medium tracking-[0.02em] text-[var(--hca-ink)]">
            hcp engagement
          </p>
          <span className="text-xs text-[var(--hca-ink-muted)]">·</span>
          <nav className="flex flex-wrap items-center gap-1" aria-label="主导航">
            {TABS.filter((tab) => {
              if ("needsHcp" in tab && tab.needsHcp) return hasHcp;
              return true;
            }).map((tab) => {
              const active =
                pathname === tab.href || pathname.startsWith(`${tab.href}/`);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={active ? "hca-tab hca-tab-active" : "hca-tab"}
                >
                  {tab.label}
                </Link>
              );
            })}
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
