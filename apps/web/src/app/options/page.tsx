"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHcpContext } from "@/store/hcp-context";

export default function OptionsRedirectPage() {
  const router = useRouter();
  const selectedHcpId = useHcpContext((s) => s.selectedHcpId);
  const openTwins = useHcpContext((s) => s.openTwins);

  useEffect(() => {
    const targetId =
      selectedHcpId ?? openTwins[openTwins.length - 1]?.hcpId ?? null;
    if (targetId) {
      router.replace(
        `/twins/${encodeURIComponent(targetId)}/options`,
      );
    } else {
      router.replace("/twins");
    }
  }, [router, selectedHcpId, openTwins]);

  return (
    <p className="text-sm text-[var(--hca-ink-muted)]">正在跳转…</p>
  );
}
