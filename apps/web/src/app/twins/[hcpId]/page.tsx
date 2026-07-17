import { Suspense } from "react";
import TwinDetailClient from "./TwinDetailClient";

export default function Page() {
  return (
    <Suspense
      fallback={<p className="text-sm text-[var(--hca-ink-muted)]">加载中…</p>}
    >
      <TwinDetailClient />
    </Suspense>
  );
}
