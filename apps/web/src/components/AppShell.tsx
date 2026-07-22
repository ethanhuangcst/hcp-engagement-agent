"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { AppBrand } from "@/components/AppBrand";
import { ShellTab } from "@/components/ShellTab";
import { LocaleLangSync, useT } from "@/i18n";
import type { Locale } from "@/i18n/types";
import {
  isTwinEditPath,
  shellTwinIdFromPath,
  surnameAbbrev,
  twinDisplayName,
  twinIdFromPath,
  useHcpContext,
  type OpenTwin,
} from "@/store/hcp-context";

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function useHcpContextHydrated() {
  const openTwins = useHcpContext((s) => s.openTwins);
  const locale = useHcpContext((s) => s.locale);
  const setLocale = useHcpContext((s) => s.setLocale);
  const closeTwin = useHcpContext((s) => s.closeTwin);
  const hydrated = useHydrated();

  if (!hydrated) {
    return {
      openTwins: [] as OpenTwin[],
      locale: "zh-CN" as Locale,
      setLocale,
      closeTwin,
      hydrated: false,
    };
  }
  return { openTwins, locale, setLocale, closeTwin, hydrated: true };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tr = useT();
  const { openTwins, locale, setLocale, closeTwin } = useHcpContextHydrated();
  const wide = pathname.startsWith("/agent");

  const activeTwinId = shellTwinIdFromPath(pathname);
  const showSpecimen =
    twinIdFromPath(pathname) != null && !isTwinEditPath(pathname);
  const activeTwin = showSpecimen
    ? openTwins.find((t) => t.hcpId === activeTwinId)
    : null;
  const abbrev = showSpecimen
    ? surnameAbbrev(
        activeTwin ? twinDisplayName(activeTwin, locale) : null,
      )
    : "—";

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
      <LocaleLangSync />
      <aside
        className="flex w-8 shrink-0 flex-col items-center gap-3 border-r border-[var(--hca-line)] bg-[var(--hca-accent-soft)] pt-6"
        aria-label={tr("shell.specimen")}
      >
        <span
          className="text-[13px] font-semibold tracking-[0.12em] text-[var(--hca-ink)]"
          style={{ writingMode: "vertical-rl" }}
        >
          {abbrev}
        </span>
        <span
          className="h-1.5 w-1.5 rounded-full border border-[var(--hca-ink)] bg-transparent"
          title={
            showSpecimen ? tr("shell.specimen.open") : tr("shell.specimen.idle")
          }
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hca-shell-bar flex flex-wrap items-center gap-3 border-b border-[var(--hca-line)] bg-[var(--hca-surface)] px-6 py-2.5">
          <AppBrand />
          <nav
            className="flex flex-wrap items-center gap-1"
            aria-label={tr("shell.nav")}
          >
            <ShellTab
              tabKey="shell-list"
              label={tr("shell.list")}
              href="/twins"
              active={listActive}
            />
            {openTwins.map((twin) => (
              <ShellTab
                key={twin.hcpId}
                tabKey={`shell-twin-${twin.hcpId}`}
                label={twinDisplayName(twin, locale)}
                href={`/twins/${encodeURIComponent(twin.hcpId)}`}
                active={activeTwinId === twin.hcpId}
                closable
                onClose={() => handleCloseTwin(twin.hcpId)}
              />
            ))}
            <ShellTab
              tabKey="shell-agent"
              label={tr("shell.agent")}
              href="/agent"
              active={agentActive}
            />
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label={tr("shell.locale.label")}
            >
              <button
                type="button"
                className={`px-1.5 py-0.5 ${
                  locale === "zh-CN"
                    ? "text-[var(--hca-ink)] underline underline-offset-2"
                    : "text-[var(--hca-ink-muted)] hover:text-[var(--hca-ink)]"
                }`}
                onClick={() => setLocale("zh-CN")}
                aria-pressed={locale === "zh-CN"}
              >
                {tr("shell.locale.zh")}
              </button>
              <span className="text-[var(--hca-ink-muted)]" aria-hidden>
                |
              </span>
              <button
                type="button"
                className={`px-1.5 py-0.5 ${
                  locale === "en"
                    ? "text-[var(--hca-ink)] underline underline-offset-2"
                    : "text-[var(--hca-ink-muted)] hover:text-[var(--hca-ink)]"
                }`}
                onClick={() => setLocale("en")}
                aria-pressed={locale === "en"}
              >
                {tr("shell.locale.en")}
              </button>
            </div>
          </div>
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
