"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useT } from "@/i18n";
import { useHcpContext } from "@/store/hcp-context";

export default function InsightsRedirectPage() {
  const router = useRouter();
  const tr = useT();
  const selectedHcpId = useHcpContext((s) => s.selectedHcpId);
  const openTwins = useHcpContext((s) => s.openTwins);

  useEffect(() => {
    const targetId =
      selectedHcpId ?? openTwins[openTwins.length - 1]?.hcpId ?? null;
    if (targetId) {
      router.replace(
        `/twins/${encodeURIComponent(targetId)}/insights`,
      );
    } else {
      router.replace("/twins");
    }
  }, [router, selectedHcpId, openTwins]);

  return (
    <p className="text-sm text-[var(--hca-ink-muted)]">
      {tr("common.redirecting")}
    </p>
  );
}
