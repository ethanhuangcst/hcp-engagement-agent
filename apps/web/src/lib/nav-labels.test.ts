import { describe, expect, it } from "vitest";
import { twinBackLabel } from "./nav-labels";

describe("twinBackLabel", () => {
  it("formats HCP name into back-to-twin label", () => {
    expect(twinBackLabel("朱同玉")).toBe("返回朱同玉数字分身");
  });

  it("falls back when name empty", () => {
    expect(twinBackLabel("  ")).toBe("返回该 HCP数字分身");
  });
});
