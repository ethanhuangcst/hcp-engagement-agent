"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type HcpContextState = {
  selectedHcpId: string | null;
  selectedName: string | null;
  setSelected: (hcpId: string | null, name?: string | null) => void;
};

export const useHcpContext = create<HcpContextState>()(
  persist(
    (set) => ({
      selectedHcpId: null,
      selectedName: null,
      setSelected: (hcpId, name = null) =>
        set({ selectedHcpId: hcpId, selectedName: name }),
    }),
    { name: "hca-hcp-context" },
  ),
);

export function surnameAbbrev(name: string | null | undefined): string {
  if (!name?.trim()) return "—";
  return name.trim().slice(0, 1);
}
