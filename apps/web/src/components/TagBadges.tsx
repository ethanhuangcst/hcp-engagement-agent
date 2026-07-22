"use client";

import type { HcpTags } from "@hca/domain";
import { useT } from "@/i18n";

type ChipVariant = "tier1" | "tier2" | "tier3" | "kol" | "soft" | "warn";

function TagChip({ label, variant }: { label: string; variant: ChipVariant }) {
  const styles: Record<ChipVariant, string> = {
    tier1: "bg-[var(--hca-ink)] text-[var(--hca-surface)]",
    tier2: "bg-[var(--hca-accent)] text-[var(--hca-on-accent)]",
    tier3: "bg-[var(--hca-line)] text-[var(--hca-ink)]",
    kol: "bg-[var(--hca-accent)] text-[var(--hca-on-accent)]",
    soft: "bg-[var(--hca-accent-soft)] text-[var(--hca-ink)]",
    warn: "border border-dashed border-[var(--hca-line)] bg-[var(--hca-accent-soft)] text-[var(--hca-ink)]",
  };
  return (
    <span
      className={`inline-block rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em] ${styles[variant]}`}
    >
      {label}
    </span>
  );
}

function roleVariant(r: string): ChipVariant {
  const upper = r.toUpperCase();
  if (upper === "KOL" || r === "kol") return "kol";
  if (
    r === "行政" ||
    r === "政策发声" ||
    r === "administrator" ||
    r === "policy_voice"
  ) {
    return "warn";
  }
  return "soft";
}

export function TagBadges({ tags }: { tags?: HcpTags | null }) {
  const tr = useT();
  if (!tags?.hcp_tier) {
    return (
      <span className="text-xs text-[var(--hca-ink-muted)]">
        {tr("common.unclassified")}
      </span>
    );
  }
  const tierVariant: ChipVariant =
    tags.hcp_tier === "T1"
      ? "tier1"
      : tags.hcp_tier === "T2"
        ? "tier2"
        : "tier3";
  const roles = (tags.role_tags ?? []).slice(0, 4);
  const displayRole = (r: string): string => {
    if (r === "kol" || r === "KOL") return "KOL";
    if (r === "kme" || r === "KME") return "KME";
    if (r === "administrator" || r === "行政")
      return tr("common.role.administrator");
    if (r === "policy_voice" || r === "政策发声")
      return tr("common.role.policy_voice");
    if (r === "frontline" || r === "一线") return tr("common.role.frontline");
    return r;
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TagChip label={tags.hcp_tier} variant={tierVariant} />
      {roles.map((r) => (
        <TagChip key={r} label={displayRole(r)} variant={roleVariant(r)} />
      ))}
    </div>
  );
}
