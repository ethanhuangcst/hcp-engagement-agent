"use client";

import { useEffect } from "react";
import { useHcpContext } from "@/store/hcp-context";

/** Sync `<html lang>` with persisted UI locale. */
export function LocaleLangSync() {
  const locale = useHcpContext((s) => s.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
