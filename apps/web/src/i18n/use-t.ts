"use client";

import { useCallback } from "react";
import { t } from "./t";
import type { MessageKey } from "./types";
import { useHcpContext } from "@/store/hcp-context";

export function useT() {
  const locale = useHcpContext((s) => s.locale);
  return useCallback(
    (key: MessageKey, vars?: Record<string, string>) => t(locale, key, vars),
    [locale],
  );
}

export function useLocale() {
  return useHcpContext((s) => s.locale);
}
