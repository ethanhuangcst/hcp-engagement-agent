"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/i18n/types";

export type OpenTwin = { hcpId: string; name: string };

type HcpContextState = {
  selectedHcpId: string | null;
  selectedName: string | null;
  openTwins: OpenTwin[];
  locale: Locale;
  setSelected: (hcpId: string | null, name?: string | null) => void;
  openTwin: (hcpId: string, name: string) => void;
  closeTwin: (hcpId: string) => void;
  setLocale: (locale: Locale) => void;
};

export const useHcpContext = create<HcpContextState>()(
  persist(
    (set, get) => ({
      selectedHcpId: null,
      selectedName: null,
      openTwins: [],
      locale: "zh-CN",
      setSelected: (hcpId, name = null) =>
        set({ selectedHcpId: hcpId, selectedName: name }),
      openTwin: (hcpId, name) => {
        const trimmed = name.trim() || hcpId;
        const existing = get().openTwins;
        const idx = existing.findIndex((t) => t.hcpId === hcpId);
        const openTwins =
          idx >= 0
            ? existing.map((t, i) =>
                i === idx ? { hcpId, name: trimmed } : t,
              )
            : [...existing, { hcpId, name: trimmed }];
        set({
          openTwins,
          selectedHcpId: hcpId,
          selectedName: trimmed,
        });
      },
      closeTwin: (hcpId) => {
        const openTwins = get().openTwins.filter((t) => t.hcpId !== hcpId);
        const selected =
          get().selectedHcpId === hcpId
            ? { selectedHcpId: null, selectedName: null }
            : {};
        set({ openTwins, ...selected });
      },
      setLocale: (locale) => set({ locale }),
    }),
    { name: "hca-hcp-context" },
  ),
);

export function surnameAbbrev(name: string | null | undefined): string {
  if (!name?.trim()) return "—";
  return name.trim().slice(0, 1);
}

/** Active twin id from workspace routes (/twins/{id}, /insights, /options); excludes new/edit. */
export function twinIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/twins\/([^/]+)(?:\/(?:insights|options))?\/?$/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  if (id === "new") return null;
  return id;
}

export function isTwinEditPath(pathname: string): boolean {
  return /^\/twins\/[^/]+\/edit\/?$/.test(pathname);
}

/** Twin id for shell tab highlight (workspace or edit). */
export function shellTwinIdFromPath(pathname: string): string | null {
  const workspace = twinIdFromPath(pathname);
  if (workspace) return workspace;
  const m = pathname.match(/^\/twins\/([^/]+)\/edit\/?$/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  return id === "new" ? null : id;
}
