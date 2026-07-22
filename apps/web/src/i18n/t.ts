import { en } from "./messages/en";
import { zhCN } from "./messages/zh-CN";
import type { Locale, MessageKey, Messages } from "./types";

const catalogs: Record<Locale, Messages> = {
  "zh-CN": zhCN,
  en,
};

export function getMessages(locale: Locale): Messages {
  return catalogs[locale] ?? zhCN;
}

export function t(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string>,
): string {
  let msg = getMessages(locale)[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replace(`{${k}}`, v);
    }
  }
  return msg;
}
