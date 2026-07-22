"use client";

import { useParams } from "next/navigation";
import OptionsClient from "@/app/options/OptionsClient";

export default function TwinOptionsPage() {
  const params = useParams<{ hcpId: string }>();
  const hcpId = decodeURIComponent(params.hcpId);
  return <OptionsClient hcpId={hcpId} />;
}
