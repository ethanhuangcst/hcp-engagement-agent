"use client";

import { localizeCareerKind, localizeCareerText } from "@/i18n/career";
import { t } from "@/i18n";
import { useHcpContext } from "@/store/hcp-context";

type CareerNode = {
  title?: string;
  org?: string;
  as_of?: string;
  year?: string | number;
  kind?: string;
  role?: string;
};

function yearOf(n: CareerNode): string {
  if (n.year != null) return String(n.year);
  if (n.as_of) return n.as_of.slice(0, 4);
  return "—";
}

export function CareerTimeline({ career }: { career?: Record<string, unknown> }) {
  const locale = useHcpContext((s) => s.locale);
  const tr = (key: Parameters<typeof t>[1]) => t(locale, key);

  const nodes: CareerNode[] = [];
  const current = career?.positions_current;
  if (Array.isArray(current)) {
    for (const n of current) {
      if (n && typeof n === "object") {
        nodes.push({ ...(n as CareerNode), kind: "current" });
      }
    }
  }
  const past = career?.positions_past;
  if (Array.isArray(past)) {
    for (const n of past) {
      if (n && typeof n === "object") {
        nodes.push({ ...(n as CareerNode), kind: "past" });
      }
    }
  }
  const edu = career?.education;
  if (Array.isArray(edu)) {
    for (const n of edu) {
      if (n && typeof n === "object") {
        nodes.push({ ...(n as CareerNode), kind: "education" });
      }
    }
  }
  const society = career?.society_roles;
  if (Array.isArray(society)) {
    for (const n of society) {
      if (n && typeof n === "object") {
        nodes.push({ ...(n as CareerNode), kind: "society" });
      }
    }
  }

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-[var(--hca-ink-muted)]">
        {tr("career.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {nodes.map((n, i) => {
        const rawRole = n.title ?? n.role ?? tr("career.role.default");
        const role = localizeCareerText(rawRole, locale);
        const org = n.org ? localizeCareerText(n.org, locale) : "";
        const kindLabel = localizeCareerKind(n.kind, locale, (key) =>
          tr(key as Parameters<typeof t>[1]),
        );
        const last = i === nodes.length - 1;
        return (
          <div
            key={`${yearOf(n)}-${rawRole}-${i}`}
            className="flex min-h-[52px] gap-3.5"
          >
            <div className="w-12 shrink-0 pt-0.5 text-right font-[family-name:var(--font-mono)] text-xs text-[var(--hca-ink-muted)]">
              {yearOf(n)}
            </div>
            <div className="relative flex w-3 shrink-0 justify-center">
              <div
                className="absolute top-0 w-px bg-[var(--hca-accent)] opacity-55"
                style={{ bottom: last ? 24 : 0 }}
              />
              <div className="z-[1] mt-[5px] h-1.5 w-1.5 rounded-full border border-[var(--hca-accent)] bg-[var(--hca-surface)]" />
            </div>
            <div className="flex-1 space-y-0.5 pb-4">
              <p className="text-[13px] font-medium">{role}</p>
              {org ? (
                <p className="text-xs text-[var(--hca-ink-muted)]">{org}</p>
              ) : null}
              {kindLabel ? (
                <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
                  {kindLabel}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
