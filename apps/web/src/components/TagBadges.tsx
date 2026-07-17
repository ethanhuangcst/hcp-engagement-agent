import type { HcpTags } from "@hca/domain";

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

function displayRole(r: string): string {
  const map: Record<string, string> = {
    kol: "KOL",
    kme: "KME",
    administrator: "行政",
    policy_voice: "政策发声",
    frontline: "一线",
  };
  return map[r] ?? r;
}

export function TagBadges({ tags }: { tags?: HcpTags | null }) {
  if (!tags?.hcp_tier) {
    return <span className="text-xs text-[var(--hca-ink-muted)]">未分级</span>;
  }
  const tierVariant: ChipVariant =
    tags.hcp_tier === "T1"
      ? "tier1"
      : tags.hcp_tier === "T2"
        ? "tier2"
        : "tier3";
  const roles = (tags.role_tags ?? []).slice(0, 4);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TagChip label={tags.hcp_tier} variant={tierVariant} />
      {roles.map((r) => (
        <TagChip key={r} label={displayRole(r)} variant={roleVariant(r)} />
      ))}
    </div>
  );
}
