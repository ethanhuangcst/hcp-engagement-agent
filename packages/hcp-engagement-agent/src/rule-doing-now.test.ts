import { describe, expect, it } from "vitest";
import { sampleZhuInsights, sampleZhuTwin } from "./fixtures/zhu.js";
import { ruleSynthesizeDoingNow } from "./rule-doing-now.js";

describe("ruleSynthesizeDoingNow", () => {
  it("builds auditable summary from themes and pubs", () => {
    const twin = sampleZhuTwin();
    const insights = sampleZhuInsights();
    const d = ruleSynthesizeDoingNow(twin, insights);
    expect(d.summary.length).toBeGreaterThan(8);
    expect(d.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.evidence_refs?.length).toBeGreaterThan(0);
    expect(d.summary).not.toMatch(/处方|统方|进院/);
  });
});
