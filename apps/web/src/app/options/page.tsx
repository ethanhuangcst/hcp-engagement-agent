"use client";

import { useHcpContext } from "@/store/hcp-context";

export default function OptionsPlaceholderPage() {
  const { selectedHcpId, selectedName } = useHcpContext();
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--hca-ink-muted)]">一人一策</p>
      <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight">
        Engagement Options
      </h1>
      <p className="text-sm text-[var(--hca-ink-muted)]">
        面向 {selectedName ?? "—"}（hcp:{selectedHcpId ?? "—"}）
      </p>
      <p className="max-w-[520px] text-sm text-[var(--hca-ink-muted)]">
        Engagement Options 在 MVP-6 交付。MVP-1 仅解锁本 Tab 门禁。
      </p>
    </div>
  );
}
