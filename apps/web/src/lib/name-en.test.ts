import { describe, expect, it } from "vitest";
import { displayNameEn, isLatinNameEn } from "./name-en";

describe("displayNameEn", () => {
  it("shows Given Family Latin names", () => {
    expect(displayNameEn("朱同玉", "Tongyu Zhu")).toBe("Tongyu Zhu");
  });

  it("hides CJK or duplicate name_en", () => {
    expect(displayNameEn("王长希", "王长希")).toBeUndefined();
    expect(displayNameEn("王长希", null)).toBeUndefined();
    expect(isLatinNameEn("王长希")).toBe(false);
  });
});
