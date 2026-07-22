import { describe, expect, it } from "vitest";
import {
  pickInsightsNarrative,
  withInsightsLocale,
  type HcpInsights,
} from "./twin.js";

const base: HcpInsights = {
  hcp_id: "hcp_t",
  as_of: "2026-07-20",
  doing_now: {
    summary: "中文一句话",
    as_of: "2026-07-20",
    locale: "zh-CN",
  },
  interest_directions: [{ title: "兴趣" }],
  opportunities: [{ title: "机会" }],
  evidence: [{ name: "证据中文" }],
};

describe("insights locale buckets", () => {
  it("writing en does not erase zh bucket", () => {
    const withZh = withInsightsLocale(base, "zh-CN", {
      doing_now: base.doing_now,
      interest_directions: base.interest_directions,
      opportunities: base.opportunities,
      evidence: base.evidence,
    });
    const both = withInsightsLocale(withZh, "en", {
      doing_now: {
        summary: "English one-liner",
        as_of: "2026-07-20",
        locale: "en",
      },
      interest_directions: [{ title: "Interest" }],
      opportunities: [{ title: "Opportunity" }],
      evidence: [{ name: "Evidence EN" }],
    });
    expect(pickInsightsNarrative(both, "zh-CN").doing_now?.summary).toBe(
      "中文一句话",
    );
    expect(pickInsightsNarrative(both, "en").doing_now?.summary).toBe(
      "English one-liner",
    );
  });

  it("en pick does not fall back to Chinese top-level", () => {
    const picked = pickInsightsNarrative(base, "en");
    expect(picked.doing_now?.summary).toBeUndefined();
  });
});
