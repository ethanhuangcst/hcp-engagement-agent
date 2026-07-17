import { describe, expect, it } from "vitest";
import { TwinListItem } from "./twins.js";

/** Unit-level shape check without live DB (integration covered by MCP mock + optional live). */
describe("@hca/db exports", () => {
  it("TwinListItem type is usable", () => {
    const item: TwinListItem = {
      hcp_id: "hcp_x",
      name_zh: "测试",
      hospital: "医院",
      department: "科室",
      as_of: "2026-07-17",
      twin_version: 1,
      tags: null,
    };
    expect(item.hcp_id).toBe("hcp_x");
  });
});
