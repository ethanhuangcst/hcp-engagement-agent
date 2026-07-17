import { describe, expect, it } from "vitest";
import { localizeCareerKind, localizeCareerText, normalizeCareerKind } from "./career";
import { t } from "./index";

describe("normalizeCareerKind", () => {
  it("maps known kind aliases", () => {
    expect(normalizeCareerKind("education")).toBe("education");
    expect(normalizeCareerKind("positions_current")).toBe("current");
    expect(normalizeCareerKind("society_roles")).toBe("society");
  });
});

describe("localizeCareerKind", () => {
  const tr = (key: string) => t("zh-CN", key as never);

  it("localizes education kind in zh-CN", () => {
    expect(localizeCareerKind("education", "zh-CN", tr)).toBe("教育");
  });

  it("localizes current kind in en", () => {
    expect(
      localizeCareerKind("current", "en", (key) => t("en", key as never)),
    ).toBe("Current");
  });
});

describe("localizeCareerText", () => {
  it("maps English titles to zh-CN", () => {
    expect(localizeCareerText("Professor of Surgery", "zh-CN")).toBe(
      "教授 of Surgery",
    );
    expect(localizeCareerText("Director, Transplant Center", "zh-CN")).toBe(
      "主任, Transplant Center",
    );
  });

  it("maps zh-CN titles to en", () => {
    expect(localizeCareerText("主任医师", "en")).toBe("Chief Physician");
    expect(localizeCareerText("复旦大学附属中山医院", "en")).toContain(
      "Hospital",
    );
  });

  it("returns identity for en source in en locale", () => {
    expect(localizeCareerText("Chief Physician", "en")).toBe("Chief Physician");
  });
});
