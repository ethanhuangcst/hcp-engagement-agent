"use client";

import { useT } from "@/i18n";

export function LoadingText({ className }: { className?: string }) {
  const tr = useT();
  return (
    <p className={className ?? "text-sm text-[var(--hca-ink-muted)]"}>
      {tr("common.loading")}
    </p>
  );
}
