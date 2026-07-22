import { describe, expect, it } from "vitest";
import {
  backfillNameEn,
  chineseToGivenFamily,
  effectiveNameEn,
  isLatinNameEn,
} from "./name-en.js";

describe("name_en backfill (F-WEB-047)", () => {
  it("fills from OpenAlex when empty", () => {
    expect(backfillNameEn(undefined, "Changxi Wang")).toBe("Changxi Wang");
    expect(backfillNameEn("", "Tongyu Zhu")).toBe("Tongyu Zhu");
  });

  it("does not overwrite existing Latin name_en", () => {
    expect(backfillNameEn("Changxi Wang", "Someone Else")).toBe("Changxi Wang");
  });

  it("treats CJK name_en as empty and prefers Latin OpenAlex", () => {
    expect(backfillNameEn("王长希", "Changxi Wang")).toBe("Changxi Wang");
    expect(effectiveNameEn("王长希")).toBeUndefined();
  });

  it("stays empty without literature Latin name", () => {
    expect(backfillNameEn(undefined, undefined)).toBeUndefined();
    expect(backfillNameEn(null, "  ")).toBeUndefined();
    expect(backfillNameEn(undefined, "王长希")).toBeUndefined();
  });

  it("rejects CJK as Latin name_en", () => {
    expect(isLatinNameEn("王长希")).toBe(false);
    expect(isLatinNameEn("Changxi Wang")).toBe(true);
  });
});

describe("chineseToGivenFamily", () => {
  it("maps common HCP names to Given Family", () => {
    expect(chineseToGivenFamily("王长希")).toBe("Changxi Wang");
    expect(chineseToGivenFamily("葛均波")).toBe("Junbo Ge");
    expect(chineseToGivenFamily("朱同玉")).toBe("Tongyu Zhu");
  });
});
