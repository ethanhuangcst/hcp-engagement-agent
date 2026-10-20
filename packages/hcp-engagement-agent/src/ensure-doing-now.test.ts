import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HcpInsights, VirtualTwin } from "@hca/domain";
import type { LlmClient } from "./llm.js";
import type { LlmChatMessage, LlmChatResult } from "./types.js";

vi.mock("@hca/db", () => ({
  AGENT_GENERAL_HCP_ID: "_agent_general",
  getTwin: vi.fn(),
  getInsights: vi.fn(),
  upsertInsights: vi.fn(),
}));

vi.mock("./llm.js", () => ({
  createLlmClient: vi.fn(),
}));

import {
  getInsights,
  getTwin,
  upsertInsights,
} from "@hca/db";
import { createLlmClient } from "./llm.js";
import {
  ensureDoingNow,
  resetEnsureDoingNowForTests,
} from "./ensure-doing-now.js";

const HCP_ID = "hcp_ensure_1";

function twinFixture(overrides?: Partial<VirtualTwin>): VirtualTwin {
  return {
    meta: {
      schema_version: "twin-2.0",
      hcp_id: HCP_ID,
      as_of: "2026-10-20",
      twin_version: 2,
      built_at: new Date().toISOString(),
    },
    profile: {
      name_zh: "测试",
      hospital: "医院",
      department: "科室",
      disambiguation_status: "resolved",
      specialties: [],
    },
    research: { author_ids: { openalex: "A1" }, themes: ["甲状腺术式"] },
    ...overrides,
  } as VirtualTwin;
}

function emptyInsightsFixture(): HcpInsights {
  return {
    hcp_id: HCP_ID,
    as_of: "2026-10-20",
    interest_directions: [],
    opportunities: [],
    evidence: [],
  } as HcpInsights;
}

function fakeLlm(content: string, delayMs = 0): LlmClient {
  return {
    provider: "qwen",
    model: "qwen-plus",
    async chat() {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return { content, provider: "qwen", model: "qwen-plus" };
    },
  };
}

const LLM_OK = JSON.stringify({
  summary: "近期主题围绕甲状腺术式与移植后管理。",
  confidence: "medium",
  evidence_refs: ["research.themes"],
});

beforeEach(() => {
  resetEnsureDoingNowForTests();
  vi.clearAllMocks();
  vi.mocked(createLlmClient).mockReturnValue({
    error: {
      code: "LLM_CONFIG_INVALID",
      message: "缺 Key",
      retryable: false,
    },
  });
});

describe("ensureDoingNow（ADR-013）", () => {
  it("should_reuse_existing_summary_when_doing_now_present", async () => {
    vi.mocked(getTwin).mockResolvedValue(twinFixture());
    vi.mocked(getInsights).mockResolvedValue({
      ...emptyInsightsFixture(),
      doing_now: {
        summary: "已有洞察",
        as_of: "2026-10-19",
        confidence: "low",
      },
    } as HcpInsights);

    const r = await ensureDoingNow({ hcpId: HCP_ID }, { llm: fakeLlm(LLM_OK) });

    expect(r).toMatchObject({
      status: "ready",
      reused: true,
      doing_now: { summary: "已有洞察" },
    });
    expect(upsertInsights).not.toHaveBeenCalled();
    expect(createLlmClient).not.toHaveBeenCalled();
  });

  it("should_synthesize_and_write_back_when_empty_template_and_facts_enough", async () => {
    vi.mocked(getTwin).mockResolvedValue(twinFixture());
    vi.mocked(getInsights).mockResolvedValue(emptyInsightsFixture());

    const r = await ensureDoingNow({ hcpId: HCP_ID }, { llm: fakeLlm(LLM_OK) });

    expect(r.status).toBe("ready");
    if (r.status !== "ready") return;
    expect(r.reused).toBe(false);
    expect(r.doing_now.summary).toContain("甲状腺");
    expect(upsertInsights).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(upsertInsights).mock.calls[0]![0] as HcpInsights;
    expect(saved.doing_now?.summary).toBe(r.doing_now.summary);
  });

  it("should_return_pending_when_facts_insufficient_without_llm_call", async () => {
    const twin = twinFixture();
    delete (twin as { research?: unknown }).research;
    vi.mocked(getTwin).mockResolvedValue(twin);
    vi.mocked(getInsights).mockResolvedValue(emptyInsightsFixture());
    const llm = fakeLlm(LLM_OK);

    const r = await ensureDoingNow({ hcpId: HCP_ID }, { llm });

    expect(r).toEqual({ status: "pending", reason: "insufficient_facts" });
    expect(upsertInsights).not.toHaveBeenCalled();
  });

  it("should_return_pending_when_twin_missing", async () => {
    vi.mocked(getTwin).mockResolvedValue(null);

    const r = await ensureDoingNow({ hcpId: "hcp_none" });

    expect(r).toEqual({ status: "pending", reason: "twin_missing" });
  });

  it("should_return_pending_when_no_llm_key", async () => {
    vi.mocked(getTwin).mockResolvedValue(twinFixture());
    vi.mocked(getInsights).mockResolvedValue(emptyInsightsFixture());

    const r = await ensureDoingNow({ hcpId: HCP_ID });

    expect(r).toEqual({ status: "pending", reason: "llm_unavailable" });
    expect(upsertInsights).not.toHaveBeenCalled();
  });

  it("should_return_pending_and_not_write_when_llm_fails", async () => {
    vi.mocked(getTwin).mockResolvedValue(twinFixture());
    vi.mocked(getInsights).mockResolvedValue(emptyInsightsFixture());
    const llm: LlmClient = {
      provider: "qwen",
      model: "qwen-plus",
      async chat() {
        throw new Error("LLM 调用失败");
      },
    };

    const r = await ensureDoingNow({ hcpId: HCP_ID }, { llm });

    expect(r).toEqual({ status: "pending", reason: "llm_unavailable" });
    expect(upsertInsights).not.toHaveBeenCalled();
  });

  it("should_deduplicate_in_flight_run_for_same_hcp", async () => {
    vi.mocked(getTwin).mockResolvedValue(twinFixture());
    vi.mocked(getInsights).mockResolvedValue(emptyInsightsFixture());
    const chat = vi.fn(
      async (_messages: LlmChatMessage[]): Promise<LlmChatResult> => ({
        content: LLM_OK,
        provider: "qwen",
        model: "qwen-plus",
      }),
    );
    const llm: LlmClient = {
      provider: "qwen",
      model: "qwen-plus",
      chat: (m) => chat(m),
    };

    const [a, b] = await Promise.all([
      ensureDoingNow({ hcpId: HCP_ID }, { llm }),
      ensureDoingNow({ hcpId: HCP_ID }, { llm }),
    ]);

    expect(chat).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(upsertInsights).toHaveBeenCalledTimes(1);
  });

  it("should_run_separately_for_different_hcps", async () => {
    vi.mocked(getTwin).mockImplementation(async (id: string) =>
      id === HCP_ID ? twinFixture() : { ...twinFixture(), meta: { ...twinFixture().meta, hcp_id: id } },
    );
    vi.mocked(getInsights).mockResolvedValue(emptyInsightsFixture());
    const chat = vi.fn(
      async (_messages: LlmChatMessage[]): Promise<LlmChatResult> => ({
        content: LLM_OK,
        provider: "qwen",
        model: "qwen-plus",
      }),
    );
    const llm: LlmClient = {
      provider: "qwen",
      model: "qwen-plus",
      chat: (m) => chat(m),
    };

    await Promise.all([
      ensureDoingNow({ hcpId: HCP_ID }, { llm }),
      ensureDoingNow({ hcpId: "hcp_ensure_2" }, { llm }),
    ]);

    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("should_throw_validation_error_for_empty_hcp_id", async () => {
    await expect(ensureDoingNow({ hcpId: "" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
