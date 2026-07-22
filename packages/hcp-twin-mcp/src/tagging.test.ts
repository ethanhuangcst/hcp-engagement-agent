import { describe, expect, it } from "vitest";
import { applyTagOverride, ruleTagFromProfile } from "./tagging.js";

describe("tagging rules", () => {
  it("maps titles to tiers", () => {
    expect(ruleTagFromProfile({ title: "主任医师" }).hcp_tier).toBe("T1");
    expect(ruleTagFromProfile({ title: "副主任医师" }).hcp_tier).toBe("T2");
    expect(ruleTagFromProfile({ title: "住院医师" }).hcp_tier).toBe("T3");
    expect(ruleTagFromProfile({}).hcp_tier).toBe("unclassified");
  });

  it("preserves user_override unless force_rule", () => {
    const existing = {
      hcp_tier: "T2" as const,
      role_tags: ["kol" as const],
      tag_method: "user_override" as const,
    };
    const rule = ruleTagFromProfile({ title: "主任医师" });
    expect(applyTagOverride(existing, {}, false, rule).hcp_tier).toBe("T2");
    expect(applyTagOverride(existing, {}, true, rule).tag_method).toBe("rule");
  });
});
