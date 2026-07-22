import { describe, expect, it } from "vitest";
import { t } from "@/i18n";
import { en } from "@/i18n/messages/en";
import { zhCN } from "@/i18n/messages/zh-CN";
import type { MessageKey } from "@/i18n/types";

describe("i18n catalogs", () => {
  it("zh-CN and en expose the same keys", () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it("resolves shell and interpolation in both locales", () => {
    expect(t("zh-CN", "shell.list")).toBe("HCP数字分身");
    expect(t("en", "shell.list")).toBe("HCP Digital Twins");
    expect(t("zh-CN", "shell.closeTab", { name: "朱同玉" })).toContain("朱同玉");
    expect(t("en", "twins.list.count", { n: "2" })).toBe("2 HCPs");
  });

  it("every MessageKey has a non-empty string in both catalogs", () => {
    const keys = Object.keys(zhCN) as MessageKey[];
    for (const key of keys) {
      expect(zhCN[key].trim().length).toBeGreaterThan(0);
      expect(en[key].trim().length).toBeGreaterThan(0);
    }
  });
});
