"use client";

import Link from "next/link";

export function BackNavBar({
  label,
  href,
  onClick,
  actions,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  actions?: React.ReactNode;
}) {
  const backClass =
    "inline-flex items-center rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-3 py-1.5 text-sm text-[var(--hca-ink)] hover:bg-[var(--hca-accent-soft)]";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--hca-line)] border-l-[3px] border-l-[var(--hca-accent)] bg-[var(--hca-accent-soft)] px-3 py-2.5">
      {href ? (
        <Link href={href} className={backClass}>
          ← {label}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={backClass}>
          ← {label}
        </button>
      )}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
