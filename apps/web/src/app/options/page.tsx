"use client";

import { useHcpContext } from "@/store/hcp-context";
import OptionsClient from "./OptionsClient";

/** 兼容旧路由：无工作台上下文时引导选定 HCP */
export default function OptionsStandalonePage() {
  const selectedHcpId = useHcpContext((s) => s.selectedHcpId);
  const openTwins = useHcpContext((s) => s.openTwins);
  const hcpId = selectedHcpId ?? openTwins[0]?.hcpId;

  if (!hcpId) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-[var(--hca-ink-muted)]">一人一策</p>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium">
          Engagement Options
        </h1>
        <p className="max-w-[520px] text-sm text-[var(--hca-ink-muted)]">
          请先在「HCP数字分身」打开一位医生，再使用工作台内的「一人一策」子
          Tab。
        </p>
      </div>
    );
  }

  return <OptionsClient hcpId={hcpId} />;
}
