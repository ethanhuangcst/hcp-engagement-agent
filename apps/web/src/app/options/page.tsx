"use client";

import { useT } from "@/i18n";
import { useHcpContext } from "@/store/hcp-context";
import OptionsClient from "./OptionsClient";

/** 兼容旧路由：无工作台上下文时引导选定 HCP */
export default function OptionsStandalonePage() {
  const tr = useT();
  const selectedHcpId = useHcpContext((s) => s.selectedHcpId);
  const openTwins = useHcpContext((s) => s.openTwins);
  const hcpId = selectedHcpId ?? openTwins[0]?.hcpId;

  if (!hcpId) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-[var(--hca-ink-muted)]">
          {tr("options.title")}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium">
          {tr("options.title")}
        </h1>
        <p className="max-w-[520px] text-sm text-[var(--hca-ink-muted)]">
          {tr("options.pickHcp")}
        </p>
      </div>
    );
  }

  return <OptionsClient hcpId={hcpId} />;
}
