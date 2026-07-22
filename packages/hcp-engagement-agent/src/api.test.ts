import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { upsertInsights, upsertTwin, getInsights } from "@hca/db";
import { DoingNowSchema, HcpInsightsSchema } from "@hca/domain";
import { resolveLlmConfig } from "./config.js";
import { health } from "./health.js";
import { synthesizeDoingNow } from "./synthesize.js";
import { sampleZhuInsights, sampleZhuTwin, ZHU_HCP_ID } from "./fixtures/zhu.js";

function loadEnv(): void {
  const root = resolve(process.cwd(), "../..");
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  process.chdir(root);
}

loadEnv();

describe("domain DoingNow coerce", () => {
  it("coerces legacy string doing_now", () => {
    const r = HcpInsightsSchema.parse({
      hcp_id: "hcp_x",
      as_of: "2026-07-17",
      doing_now: "旧版字符串洞察",
    });
    expect(r.doing_now?.summary).toBe("旧版字符串洞察");
  });
});

describe("LlmClient config", () => {
  it("defaults provider to qwen", () => {
    const r = resolveLlmConfig({
      DASHSCOPE_API_KEY: "sk-test",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.provider).toBe("qwen");
      expect(r.config.model).toBe("qwen-plus");
      expect(r.config.baseUrl).toContain("dashscope");
    }
  });

  it("rejects missing key", () => {
    const r = resolveLlmConfig({
      LLM_PROVIDER: "qwen",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("LLM_CONFIG_INVALID");
  });

  it("requires base URL for openai_compatible", () => {
    const r = resolveLlmConfig({
      LLM_PROVIDER: "openai_compatible",
      LLM_API_KEY: "sk-x",
    });
    expect(r.ok).toBe(false);
  });
});

describe("MVP-2 agent against live Postgres + real LLM", () => {
  beforeAll(async () => {
    const cfg = resolveLlmConfig();
    if (!cfg.ok) {
      throw new Error(
        "缺少 DASHSCOPE_API_KEY 或 LLM_API_KEY。MVP-3 Agent 禁止 mock，请写入 .env 后重试。",
      );
    }
    const h = await health({ probeLlm: true });
    if (!h.database_ok) {
      throw new Error("Postgres 不可达（DATABASE_URL）");
    }
    if (!h.llm.reachable) {
      throw new Error("真实 LLM 探测失败，禁止用 mock 代替");
    }
    await upsertTwin(sampleZhuTwin());
    await upsertInsights(sampleZhuInsights());
  }, 120_000);

  it("health reports configured qwen path", async () => {
    const h = await health({ probeLlm: false });
    expect(h.database_ok).toBe(true);
    expect(h.llm.configured).toBe(true);
    expect(h.llm.provider).toBe("qwen");
  });

  it("synthesizeDoingNow writes audit-ready summary", async () => {
    const { doing_now, reused } = await synthesizeDoingNow({
      hcpId: ZHU_HCP_ID,
      refresh: true,
    });
    expect(reused).toBe(false);
    expect(DoingNowSchema.safeParse(doing_now).success).toBe(true);
    expect(doing_now.summary.length).toBeGreaterThan(8);
    expect(doing_now.llm?.provider).toBeTruthy();
    expect(doing_now.llm?.model).toBeTruthy();

    const stored = await getInsights(ZHU_HCP_ID);
    expect(stored?.doing_now?.summary).toBe(doing_now.summary);
  });

  it("reuses existing summary without refresh", async () => {
    const first = await getInsights(ZHU_HCP_ID);
    expect(first?.doing_now?.summary).toBeTruthy();
    const again = await synthesizeDoingNow({ hcpId: ZHU_HCP_ID });
    expect(again.reused).toBe(true);
    expect(again.doing_now.summary).toBe(first?.doing_now?.summary);
  });

  it("validation error on empty hcpId", async () => {
    await expect(synthesizeDoingNow({ hcpId: "" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("INSIGHTS_NOT_FOUND for unknown hcp", async () => {
    await expect(
      synthesizeDoingNow({ hcpId: "hcp_does_not_exist_zzz" }),
    ).rejects.toMatchObject({ code: "INSIGHTS_NOT_FOUND" });
  });
});
