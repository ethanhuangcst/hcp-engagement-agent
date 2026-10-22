import { beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import { resolve } from "node:path";
import {
  getChatSession,
  loadRootEnv,
  upsertInsights,
  upsertTwin,
} from "@hca/db";
import { chat } from "./chat.js";
import {
  LATENCY_BUDGET_MS,
  type LlmCallOutcome,
  timeLlmCall,
} from "./latency.js";
import { proposeOptions } from "./propose.js";
import {
  PROMPTS_V1,
  PROMPT_TEMPLATE_VERSION,
  type PromptName,
} from "./prompts/v1/index.js";
import { reviseEngagement } from "./revise.js";
import { synthesizeDoingNow } from "./synthesize.js";
import type { LlmClient } from "./llm.js";
import { agentError, type AgentError } from "./types.js";
import { sampleZhuInsights, sampleZhuTwin, ZHU_HCP_ID } from "./fixtures/zhu.js";

loadRootEnv();
process.chdir(resolve(process.cwd(), "../.."));

const TEMPLATE_NAMES: PromptName[] = [
  "propose",
  "revise",
  "synthesize",
  "open_chat",
];

const ROCKS_SECTIONS = [
  "R｜角色",
  "O｜目标",
  "C｜上下文",
  "K｜关键事实",
  "S｜输出要求",
] as const;

function llmReturning(content: string): LlmClient {
  return {
    provider: "mock",
    model: "mock-1",
    chat: async () => ({ content, provider: "mock", model: "mock-1" }),
  };
}

function llmThrowing(error: AgentError): LlmClient {
  return {
    provider: "mock",
    model: "mock-1",
    chat: async () => {
      throw error;
    },
  };
}

function optionsPayload(): string {
  return JSON.stringify({
    options: [
      {
        action: "MSL 科学交流",
        owner: "MSL 主导",
        channel: "线下会议",
        theme: "移植感染",
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
        theme: "移植随访",
        success_signal: "议程确认",
        compliance_note: "机构同意与代表备案",
        priority: "P1",
      },
    ],
  });
}

beforeAll(async () => {
  await upsertTwin(sampleZhuTwin());
  await upsertInsights(sampleZhuInsights());
});

describe("F-AGT-031/032：prompts/v1 注册表与 ROCKS 分段", () => {
  it("四个模板名称齐全且版本统一", () => {
    expect(PROMPT_TEMPLATE_VERSION).toBe("v1");
    for (const name of TEMPLATE_NAMES) {
      const tpl = PROMPTS_V1[name];
      expect(tpl, `模板 ${name} 缺失`).toBeTruthy();
      expect(tpl.name).toBe(name);
      expect(tpl.version).toBe("v1");
      expect(tpl.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("每个模板按 ROCKS 五段注释分节且顺序正确", () => {
    for (const name of TEMPLATE_NAMES) {
      const text = PROMPTS_V1[name].text;
      const positions = ROCKS_SECTIONS.map((s) => text.indexOf(s));
      for (const [i, pos] of positions.entries()) {
        expect(pos, `模板 ${name} 缺少 ${ROCKS_SECTIONS[i]} 分节`).toBeGreaterThanOrEqual(0);
      }
      const sorted = [...positions].sort((a, b) => a - b);
      expect(positions, `模板 ${name} 分节顺序错乱`).toEqual(sorted);
    }
  });

  it("propose / revise / synthesize 保留注入防线声明", () => {
    for (const name of ["propose", "revise", "synthesize"] as PromptName[]) {
      const text = PROMPTS_V1[name].text;
      expect(text.includes("证据数据"), `${name} 缺少证据声明`).toBe(true);
      expect(text.includes("指令性内容"), `${name} 缺少忽略指令声明`).toBe(true);
    }
  });
});

describe("F-AGT-034：时延预算", () => {
  it("预算初始值与 agent-design §13.3 一致", () => {
    expect(LATENCY_BUDGET_MS.propose).toBe(30_000);
    expect(LATENCY_BUDGET_MS.revise).toBe(30_000);
    expect(LATENCY_BUDGET_MS.synthesize).toBe(30_000);
    expect(LATENCY_BUDGET_MS.open_chat).toBe(15_000);
  });

  it("timeLlmCall 记录 elapsed 且超预算置 over_budget", async () => {
    let tick = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      tick += 1;
      return tick === 1 ? 1_000 : 1_000 + 31_500;
    });
    try {
      const outcome: LlmCallOutcome<string> = await timeLlmCall(
        async () => "ok",
        30_000,
      );
      expect(outcome.value).toBe("ok");
      expect(outcome.latency_ms).toBe(31_500);
      expect(outcome.over_budget).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("计时器异常不吞原错误", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("clock broken");
    });
    try {
      await expect(
        timeLlmCall(
          async () => {
            throw agentError("LLM_TIMEOUT", "LLM 调用超时", {
              retryable: true,
            });
          },
          30_000,
        ),
      ).rejects.toMatchObject({ code: "LLM_TIMEOUT" });
    } finally {
      vi.restoreAllMocks();
    }
  });
});

const emptyRetrieve = async (): Promise<{
  academic: never[];
  compliance: never[];
}> => ({ academic: [], compliance: [] });

describe("F-AGT-031/034：propose 元数据与降级", () => {
  it("LLM 成功路径写入模板版本与时延", async () => {
    const result = await proposeOptions(
      { hcpId: ZHU_HCP_ID },
      { llm: llmReturning(optionsPayload()), retrieve: emptyRetrieve },
    );
    expect(result.run.meta?.template).toEqual({
      name: "propose",
      version: "v1",
    });
    expect(result.run.llm).toEqual({ provider: "mock", model: "mock-1" });
    expect(typeof result.run.meta?.latency_ms).toBe("number");
    expect((result.run.meta?.latency_ms ?? -1) >= 0).toBe(true);
  }, 120_000);

  it("超时降级到规则路径并标注 degraded", async () => {
    const result = await proposeOptions(
      { hcpId: ZHU_HCP_ID },
      {
        llm: llmThrowing(
          agentError("LLM_TIMEOUT", "LLM 调用超时", { retryable: true }),
        ),
        retrieve: emptyRetrieve,
      },
    );
    expect(result.options.length).toBeGreaterThanOrEqual(3);
    expect(result.run.meta?.degraded).toBe(true);
    expect(result.run.llm).toBeUndefined();
    expect(result.run.meta?.template).toEqual({
      name: "propose",
      version: "v1",
    });
  }, 120_000);
});

describe("F-AGT-031/034：synthesize 元数据与降级", () => {
  const synthJson = JSON.stringify({
    summary: "朱同玉教授近期聚焦肾移植后感染管理与应用基础研究。",
    analysis: "建议以 MSL 科学交流切入。",
    evidence_refs: ["research.themes"],
    confidence: "medium",
  });

  it("LLM 成功路径 doing_now 写入模板版本与时延", async () => {
    const result = await synthesizeDoingNow(
      { hcpId: ZHU_HCP_ID, refresh: true },
      { llm: llmReturning(synthJson) },
    );
    expect(result.reused).toBe(false);
    expect(result.doing_now.template).toEqual({
      name: "synthesize",
      version: "v1",
    });
    expect(typeof result.doing_now.latency_ms).toBe("number");
    expect((result.doing_now.latency_ms ?? -1) >= 0).toBe(true);
  }, 120_000);

  it("超时降级到规则路径并标注 degraded", async () => {
    const result = await synthesizeDoingNow(
      { hcpId: ZHU_HCP_ID, refresh: true },
      {
        llm: llmThrowing(
          agentError("LLM_TIMEOUT", "LLM 调用超时", { retryable: true }),
        ),
      },
    );
    expect(result.reused).toBe(false);
    expect(result.doing_now.summary.trim().length).toBeGreaterThan(0);
    expect(result.doing_now.degraded).toBe(true);
  }, 120_000);
});

describe("F-AGT-031：revise 与 chat 会话模板版本", () => {
  it("revise 写入 run meta 与结果元数据", async () => {
    const proposed = await proposeOptions(
      { hcpId: ZHU_HCP_ID },
      { llm: llmReturning(optionsPayload()), retrieve: emptyRetrieve },
    );
    const revised = await reviseEngagement(
      {
        hcpId: ZHU_HCP_ID,
        optionRunId: proposed.runId,
        feedback: "请把渠道改得更偏 MSL",
        optionId: proposed.options[0]!.id,
      },
      {
        llm: llmReturning(
          JSON.stringify({
            option: { theme: "MSL 学术交流" },
            reply: "已按反馈修订。",
          }),
        ),
      },
    );
    expect(revised.run.meta?.template).toEqual({
      name: "revise",
      version: "v1",
    });
    expect(revised.template).toEqual({ name: "revise", version: "v1" });
    expect(typeof revised.latency_ms).toBe("number");
    expect((revised.latency_ms ?? -1) >= 0).toBe(true);
  }, 120_000);

  it("open_chat 会话写入模板版本与时延", async () => {
    const result = await chat(
      { mode: "open_chat", message: "国内肾移植领域可关注哪些学术会议？" },
      { llm: llmReturning("建议关注肾移植年会与器官移植学术会议。") },
    );
    const session = await getChatSession(result.sessionId);
    expect(session?.template).toEqual({
      name: "open_chat",
      version: "v1",
    });
    expect(typeof session?.latency_ms).toBe("number");
  }, 120_000);

  it("revise_options 会话写入模板版本", async () => {
    const proposed = await proposeOptions(
      { hcpId: ZHU_HCP_ID },
      { llm: llmReturning(optionsPayload()), retrieve: emptyRetrieve },
    );
    const revised = await chat(
      {
        mode: "revise_options",
        hcpId: ZHU_HCP_ID,
        optionRunId: proposed.runId,
        optionId: proposed.options[0]!.id,
        message: "请把主题改得更偏科研合作",
      },
      {
        llm: llmReturning(
          JSON.stringify({
            option: { theme: "科研合作" },
            reply: "已按反馈修订。",
          }),
        ),
      },
    );
    const session = await getChatSession(revised.sessionId);
    expect(session?.template).toEqual({
      name: "revise",
      version: "v1",
    });
  }, 120_000);
});

afterEach(() => {
  vi.restoreAllMocks();
});