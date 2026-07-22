"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/i18n/types";
import { displayNameEn } from "@/lib/name-en";

export type OpenTwin = {
  hcpId: string;
  nameZh: string;
  nameEn?: string | null;
};

type HcpContextState = {
  selectedHcpId: string | null;
  selectedName: string | null;
  openTwins: OpenTwin[];
  locale: Locale;
  setSelected: (
    hcpId: string | null,
    nameZh?: string | null,
    nameEn?: string | null,
  ) => void;
  openTwin: (hcpId: string, nameZh: string, nameEn?: string | null) => void;
  closeTwin: (hcpId: string) => void;
  setLocale: (locale: Locale) => void;
};

function normalizeOpenTwin(raw: {
  hcpId: string;
  nameZh?: string;
  nameEn?: string | null;
  name?: string;
}): OpenTwin {
  return {
    hcpId: raw.hcpId,
    nameZh: (raw.nameZh ?? raw.name ?? raw.hcpId).trim() || raw.hcpId,
    nameEn: raw.nameEn ?? null,
  };
}

/** Tab / display label for an open twin under the current UI locale. */
export function twinDisplayName(
  twin: Pick<OpenTwin, "nameZh" | "nameEn" | "hcpId">,
  locale: Locale,
): string {
  if (locale === "en") {
    const en = displayNameEn(twin.nameZh, twin.nameEn);
    if (en) return en;
  }
  return twin.nameZh || twin.hcpId;
}

export const useHcpContext = create<HcpContextState>()(
  persist(
    (set, get) => ({
      selectedHcpId: null,
      selectedName: null,
      openTwins: [],
      locale: "zh-CN",
      setSelected: (hcpId, nameZh = null, nameEn = null) =>
        set({
          selectedHcpId: hcpId,
          selectedName: nameZh,
          ...(hcpId && nameZh
            ? {
                openTwins: get().openTwins.map((t) =>
                  t.hcpId === hcpId
                    ? {
                        ...t,
                        nameZh: nameZh.trim() || t.nameZh,
                        nameEn: nameEn ?? t.nameEn,
                      }
                    : t,
                ),
              }
            : {}),
        }),
      openTwin: (hcpId, nameZh, nameEn) => {
        const next = normalizeOpenTwin({ hcpId, nameZh, nameEn });
        const existing = get().openTwins;
        const idx = existing.findIndex((t) => t.hcpId === hcpId);
        const openTwins =
          idx >= 0
            ? existing.map((t, i) =>
                i === idx
                  ? {
                      hcpId,
                      nameZh: next.nameZh,
                      nameEn: next.nameEn ?? t.nameEn,
                    }
                  : t,
              )
            : [...existing, next];
        set({
          openTwins,
          selectedHcpId: hcpId,
          selectedName: next.nameZh,
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
    {
      name: "hca-hcp-context",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<HcpContextState> & {
          openTwins?: Array<{
            hcpId: string;
            nameZh?: string;
            nameEn?: string | null;
            name?: string;
          }>;
        };
        return {
          ...current,
          ...p,
          openTwins: (p.openTwins ?? current.openTwins).map(normalizeOpenTwin),
        };
      },
    },
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
