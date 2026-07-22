"use client";

import Link from "next/link";
import { useT } from "@/i18n";

/** 顶栏品牌：双人图标 + 单行统一字标 */
export function AppBrand() {
  const tr = useT();
  const title = tr("agent.title");
  return (
    <Link
      href="/twins"
      className="hca-brand"
      aria-label={`${title} · ${tr("twins.new.backList")}`}
    >
      <span className="hca-brand-mark" aria-hidden>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </span>
      <span className="hca-brand-text">{title}</span>
    </Link>
  );
}
