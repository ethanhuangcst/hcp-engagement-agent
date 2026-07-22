import { describe, expect, it } from "vitest";
import { hasBuiltIntelligence } from "./BuildProgress";
import type { VirtualTwin } from "@hca/domain";

function baseTwin(
  overrides: {
    meta?: Partial<VirtualTwin["meta"]>;
    research?: VirtualTwin["research"];
    activity?: VirtualTwin["activity"];
  } = {},
): VirtualTwin {
  return {
    meta: {
      schema_version: "0.1.5-p0",
      hcp_id: "hcp_test",
      as_of: "2026-07-20",
      twin_version: 1,
      ...overrides.meta,
    },
    profile: {
      name_zh: "测试",
      hospital: "测试医院",
      department: "测试科室",
      disambiguation_status: "unresolved",
      specialties: [],
    },
    research: overrides.research,
    activity: overrides.activity,
  };
}

describe("hasBuiltIntelligence", () => {
  it("false when only identity draft", () => {
    expect(hasBuiltIntelligence(baseTwin())).toBe(false);
  });

  it("true when meta.built_at present", () => {
    expect(
      hasBuiltIntelligence(
        baseTwin({
          meta: { built_at: "2026-07-20T02:00:00.000Z", twin_version: 2 },
        }),
      ),
    ).toBe(true);
  });

  it("true when research themes exist", () => {
    expect(
      hasBuiltIntelligence(
        baseTwin({
          research: {
            themes: ["Transplantation"],
            recent_pubs: [],
          },
        }),
      ),
    ).toBe(true);
  });

  it("true when activity last_polled_at exists", () => {
    expect(
      hasBuiltIntelligence(
        baseTwin({
          activity: { last_polled_at: "2026-07-20T02:00:00.000Z" },
        }),
      ),
    ).toBe(true);
  });
});
