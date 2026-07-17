"use client";

import { useHcpContext } from "@/store/hcp-context";

export default function InsightsPlaceholderPage() {
  const { selectedHcpId, selectedName } = useHcpContext();
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--hca-ink-muted)]">HCP 洞察</p>
      <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight">
        {selectedName ?? "未选定 HCP"}
      </h1>
      <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
        hcp:{selectedHcpId ?? "—"}
      </p>
      <p className="max-w-[520px] text-sm text-[var(--hca-ink-muted)]">
        洞察八块报表在 MVP-3 交付。当前已选定数字分身，本 Tab 已解锁。
      </p>
    </div>
  );
}
