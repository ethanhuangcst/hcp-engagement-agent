import { Suspense } from "react";
import { LoadingText } from "@/components/LoadingText";
import TwinDetailClient from "./TwinDetailClient";

export default function Page() {
  return (
    <Suspense fallback={<LoadingText />}>
      <TwinDetailClient />
    </Suspense>
  );
}
