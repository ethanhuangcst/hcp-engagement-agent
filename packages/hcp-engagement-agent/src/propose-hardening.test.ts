import { beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadRootEnv, upsertInsights, upsertTwin } from "@hca/db";
import type { RagChunk } from "@hca/medical-kb";
import {
  PROPOSE_SYSTEM,
  proposeOptions,
  type ProposeRetrieveFn,
} from "./propose.js";
import { REVISE_SYSTEM, reviseEngagement } from "./revise.js";
import { SYNTH_SYSTEM } from "./synthesize.js";
import type { LlmClient } from "./llm.js";
import { sampleZhuInsights, sampleZhuTwin, ZHU_HCP_ID } from "./fixtures/zhu.js";

loadRootEnv();
process.chdir(resolve(process.cwd(), "../.."));

const academicChunks: RagChunk[] = [
  {
    id: "acr_point_1",
    text: "噬菌体治疗肾移植感染证据",
    score: 0.91,
    source: "pubmed",
    version: "v1",
    as_of: "2026-10-21",
    index: "academic",
    specialty: "nephrology",
    pmid: "38000101",
  },
  {
    id: "acr_point_2",
    text: "BK 病毒血症管理",
    score: 0.82,
    source: "pubmed",
    version: "v1",
    as_of: "2026-10-21",
    index: "academic",
    specialty: "nephrology",
    doi: "10.1000/bk-study",
  },
];

const complianceChunks: RagChunk[] = [
  {
    id: "ccr_point_1",
    text: "医药代表开展学术推广须备案",
    score: 0.88,
    source: "nmpa",
    version: "v1",
    as_of: "2026-10-21",
    index: "compliance",
    authority: "NMPA",
    clause_id: "med-rep-art-12",
  },
];

function llmReturning(content: string): LlmClient {
  return {
    provider: "mock",
    model: "mock-1",
    chat: async () => ({ content, provider: "mock", model: "mock-1" }),
  };
}

function optionsPayload(raw: unknown): string {
  return JSON.stringify({ options: raw });
}

function retrieveOk(): ProposeRetrieveFn {
  return async () => ({ academic: academicChunks, compliance: complianceChunks });
}

const ALLOWED_REF_IDS = new Set([
  "acr_point_1",
  "acr_point_2",
  "ccr_point_1",
  "38000101",
  "10.1000/bk-study",
  "med-rep-art-12",
]);

function assertRefsSubset(
  refs: { id: string }[],
  msg: string,
): void {
  for (const r of refs) {
    expect(ALLOWED_REF_IDS.has(r.id), `${msg}: 伪造 ref ${r.id}`).toBe(true);
  }
}

beforeAll(async () => {
  await upsertTwin(sampleZhuTwin());
  await upsertInsights(sampleZhuInsights());
});

describe("P0 hardening: propose refs 校验", () => {
  it("filters fabricated refs out of LLM options", async () => {
    const llm = llmReturning(
      optionsPayload([
        {
          action: "MSL 科学交流",
          owner: "MSL 主导",
          channel: "线下会议",
          theme: "噬菌体治疗",
          success_signal: "约定下次交流",
          compliance_note: "不替代 MLR",
          priority: "P0",
          academic_refs: [{ id: "fabricated-doi-999", label: "伪造" }],
          compliance_refs: [{ id: "made-up-clause", label: "伪造条款" }],
        },
        {
          action: "企微学术摘要推送",
          owner: "代表主导",
          channel: "企业微信",
          theme: "BK 病毒管理",
          success_signal: "推送送达",
          compliance_note: "须 MLR 版本",
          priority: "P1",
        },
        {
          action: "科室会选题建议",
          owner: "代表主导",
          channel: "院内学术推广（须机构同意）",
          theme: "移植感染",
          success_signal: "议程确认",
          compliance_note: "机构同意与代表备案",
          priority: "P1",
        },
      ]),
    );

    const result = await proposeOptions(
      { hcpId: ZHU_HCP_ID },
      { llm, retrieve: retrieveOk() },
    );

    expect(result.options.length).toBeGreaterThanOrEqual(3);
    for (const opt of result.options) {
      assertRefsSubset(opt.academic_refs, `option ${opt.id} academic_refs`);
      assertRefsSubset(opt.compliance_refs, `option ${opt.id} compliance_refs`);
    }
  }, 120_000);

  it("normalizes echoed chunk point ids to canonical refs", async () => {
    const llm = llmReturning(
      optionsPayload([
        {
          action: "MSL 科学交流",
          owner: "MSL 主导",
          channel: "线下会议",
          theme: "噬菌体治疗",
          success_signal: "约定下次交流",
          compliance_note: "不替代 MLR",
          priority: "P0",
          academic_refs: [{ id: "acr_point_1", label: "随便写的标签" }],
          compliance_refs: [{ id: "ccr_point_1", label: "随便写的条款" }],
        },
        {
          action: "企微学术摘要推送",
          owner: "代表主导",
          channel: "企业微信",
          theme: "BK 病毒管理",
          success_signal: "推送送达",
          compliance_note: "须 MLR 版本",
          priority: "P1",
        },
        {
          action: "代表访前文献对齐",
          owner: "代表主导",
          channel: "拜访前简报",
          theme: "移植感染",
          success_signal: "材料对齐",
          compliance_note: "不替代 MLR",
          priority: "P2",
        },
      ]),
    );

    const result = await proposeOptions(
      { hcpId: ZHU_HCP_ID },
      { llm, retrieve: retrieveOk() },
    );

    const first = result.options[0]!;
    const academicIds = first.academic_refs.map((r) => r.id);
    expect(academicIds).toContain("38000101");
    expect(academicIds).not.toContain("acr_point_1");
    // label 以 chunk 为准，不采信 LLM 自报 label
    const ref = first.academic_refs.find((r) => r.id === "38000101")!;
    expect(ref.label).toMatch(/PMID:38000101|pubmed/);
    const complianceIds = first.compliance_refs.map((r) => r.id);
    expect(complianceIds).toContain("med-rep-art-12");
  }, 120_000);
});

describe("P0 hardening: 检索失败显式化", () => {
  it("rethrows VALIDATION_ERROR instead of silently degrading", async () => {
    const retrieve: ProposeRetrieveFn = async () => {
      throw {
        code: "VALIDATION_ERROR",
        message: "retrieve_academic 入参无效",
        retryable: false,
      };
    };

    await expect(
      proposeOptions(
        { hcpId: ZHU_HCP_ID },
        { llm: llmReturning(optionsPayload([])), retrieve },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  }, 120_000);

  it("marks unexpected retrieval errors as retrieval_degraded and still proposes", async () => {
    const retrieve: ProposeRetrieveFn = async () => {
      throw new Error("connection pool exhausted");
    };

    const result = await proposeOptions(
      { hcpId: ZHU_HCP_ID },
      { llm: llmReturning(optionsPayload([])), retrieve },
    );

    expect(result.run.meta?.retrieval_degraded).toBe(true);
    expect(result.run.meta?.retrieval_degraded_reason).toContain(
      "connection pool exhausted",
    );
    expect(result.options.length).toBeGreaterThanOrEqual(3);
  }, 120_000);
});

describe("P0 hardening: revise refs 防覆写", () => {
  it("keeps original refs when LLM tries to overwrite them", async () => {
    const proposeLlm = llmReturning(
      optionsPayload([
        {
          action: "MSL 科学交流",
          owner: "MSL 主导",
          channel: "线下会议",
          theme: "噬菌体治疗",
          success_signal: "约定下次交流",
          compliance_note: "不替代 MLR",
          priority: "P0",
        },
        {
          action: "企微学术摘要推送",
          owner: "代表主导",
          channel: "企业微信",
          theme: "BK 病毒管理",
          success_signal: "推送送达",
          compliance_note: "须 MLR 版本",
          priority: "P1",
        },
        {
          action: "科室会选题建议",
          owner: "代表主导",
          channel: "院内学术推广（须机构同意）",
          theme: "移植感染",
          success_signal: "议程确认",
          compliance_note: "机构同意与代表备案",
          priority: "P1",
        },
      ]),
    );

    const proposed = await proposeOptions(
      { hcpId: ZHU_HCP_ID },
      { llm: proposeLlm, retrieve: retrieveOk() },
    );
    const before = proposed.options[0]!;
    expect(before.academic_refs.length).toBeGreaterThan(0);

    const reviseLlm = llmReturning(
      JSON.stringify({
        option: {
          ...before,
          theme: "修订后的主题",
          academic_refs: [{ id: "fabricated-revise-ref", label: "伪造" }],
          compliance_refs: [],
        },
        reply: "已按反馈修订。",
      }),
    );

    const revised = await reviseEngagement(
      {
        hcpId: ZHU_HCP_ID,
        optionRunId: proposed.runId,
        feedback: "请调整主题",
        optionId: before.id,
      },
      { llm: reviseLlm },
    );

    const after = revised.options.find((o) => o.id === before.id)!;
    expect(after.theme).toBe("修订后的主题");
    expect(after.academic_refs).toEqual(before.academic_refs);
    expect(after.compliance_refs).toEqual(before.compliance_refs);
  }, 120_000);
});

describe("P0 hardening: 注入防线", () => {
  it("system prompts declare retrieved text as untrusted data", () => {
    for (const [name, system] of [
      ["PROPOSE_SYSTEM", PROPOSE_SYSTEM],
      ["REVISE_SYSTEM", REVISE_SYSTEM],
      ["SYNTH_SYSTEM", SYNTH_SYSTEM],
    ] as const) {
      expect(system.includes("证据数据"), `${name} 缺少注入防线`).toBe(true);
      expect(
        system.includes("指令性内容"),
        `${name} 缺少忽略指令声明`,
      ).toBe(true);
    }
  });
});