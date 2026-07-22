"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "@/i18n";

export function ShellTab({
  tabKey: _tabKey,
  label,
  href,
  active,
  closable,
  onClose,
}: {
  tabKey: string;
  label: string;
  href: string;
  active: boolean;
  closable?: boolean;
  onClose?: () => void;
}) {
  void _tabKey;
  const tr = useT();
  const [hover, setHover] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={active ? "hca-tab hca-tab-active" : "hca-tab"}
      >
        {label}
      </Link>
      {closable && hover && onClose ? (
        <button
          type="button"
          aria-label={tr("shell.closeTab", { name: label })}
          className="hca-shell-tab-close"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
