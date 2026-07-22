import { describe, expect, it } from "vitest";
import {
  doingNowSystemPrompt,
  existingDoingNowLocale,
  openChatSystemPrompt,
  outputLanguageInstruction,
  proposeOptionsSystemPrompt,
  reviseSystemPrompt,
} from "./locale-prompt.js";
import { ruleSynthesizeDoingNow } from "./rule-doing-now.js";
import { ruleProposeOptions } from "./rule-options.js";
import type { HcpInsights, VirtualTwin } from "@hca/domain";

const twin = {
  meta: {
    schema_version: "0.1.5-p0",
    hcp_id: "hcp_t",
    as_of: "2026-07-20",
    twin_version: 1,
  },
  profile: {
    name_zh: "王长希",
    name_en: "Changxi Wang",
    hospital: "测试医院",
    department: "泌尿外科",
    disambiguation_status: "resolved",
    specialties: ["kidney transplant"],
  },
  research: { themes: ["Transplantation"] },
} as VirtualTwin;

const insights = {
  hcp_id: "hcp_t",
  as_of: "2026-07-20",
  interest_directions: [],
  opportunities: [{ title: "Academic exchange", priority: "medium" }],
} as HcpInsights;

describe("locale prompts", () => {
  it("instructs English narrative when locale=en", () => {
    expect(outputLanguageInstruction("en")).toMatch(/English/i);
    expect(doingNowSystemPrompt("en")).toMatch(/English/i);
    expect(proposeOptionsSystemPrompt("en")).toMatch(/English/i);
    expect(openChatSystemPrompt("en")).toMatch(/English/i);
    expect(reviseSystemPrompt("en")).toMatch(/English/i);
  });

  it("instructs Chinese narrative when locale=zh-CN", () => {
    expect(outputLanguageInstruction("zh-CN")).toMatch(/简体中文/);
    expect(doingNowSystemPrompt("zh-CN")).toMatch(/中文/);
  });

  it("treats missing doing_now.locale as zh-CN", () => {
    expect(existingDoingNowLocale(undefined)).toBe("zh-CN");
    expect(existingDoingNowLocale({})).toBe("zh-CN");
    expect(existingDoingNowLocale({ locale: "en" })).toBe("en");
  });
});

describe("rule fallbacks by locale", () => {
  it("rule doing_now English summary", () => {
    const d = ruleSynthesizeDoingNow(twin, insights, "en");
    expect(d.locale).toBe("en");
    expect(d.summary).toMatch(/Public|research|profile/i);
  });

  it("rule options English labels", () => {
    const opts = ruleProposeOptions(twin, insights, [], [], "en");
    expect(opts[0]?.label).toMatch(/Option/i);
    expect(opts[0]?.action).toMatch(/MSL|scientific|exchange/i);
  });
});
