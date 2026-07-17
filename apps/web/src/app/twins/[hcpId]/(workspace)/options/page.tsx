"use client";

import { useParams } from "next/navigation";
import { useHcpContext } from "@/store/hcp-context";

export default function TwinOptionsPage() {
  const params = useParams<{ hcpId: string }>();
  const hcpId = decodeURIComponent(params.hcpId);
  const selectedName = useHcpContext((s) => s.selectedName);
  const openTwins = useHcpContext((s) => s.openTwins);
  const twin = openTwins.find((t) => t.hcpId === hcpId);
  const displayName = twin?.name || selectedName || "该 HCP";

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <p className="text-xs text-[var(--hca-ink-muted)]">一人一策</p>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight">
          Engagement Options
        </h1>
        <p className="text-sm text-[var(--hca-ink-muted)]">
          面向 {displayName}（hcp:{hcpId}）
        </p>
        <p className="max-w-[520px] text-sm text-[var(--hca-ink-muted)]">
          Engagement Options 在 MVP-4 交付。当前仅解锁本子 Tab；可通过顶栏姓名标签或「关闭本页」切换分身。
        </p>
      </div>
    </div>
  );
}
