import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { upsertInsights, upsertTwin } from "@hca/db";
import { evaluateOptionsGate } from "./gate.js";
import { chat } from "./chat.js";
import { proposeOptions } from "./propose.js";
import { runComplianceGate } from "./gate.js";
import { ruleProposeOptions } from "./rule-options.js";
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

describe("ruleProposeOptions", () => {
  it("returns 3–5 options with dual ref slots", () => {
    const opts = ruleProposeOptions(
      sampleZhuTwin(),
      sampleZhuInsights(),
      [],
      [],
    );
    expect(opts.length).toBeGreaterThanOrEqual(3);
    expect(opts.length).toBeLessThanOrEqual(5);
    const first = opts[0]!;
    expect(first.action).toBeTruthy();
    expect(first.compliance_note).toMatch(/MLR|合规/);
  });
});

describe("evaluateOptionsGate", () => {
  it("rejects absolute claims", () => {
    const opts = ruleProposeOptions(
      sampleZhuTwin(),
      sampleZhuInsights(),
      [],
      [],
    );
    const first = opts[0]!;
    opts[0] = {
      ...first,
      theme: "宣传本品最好且保证治愈",
    };
    const gate = evaluateOptionsGate(opts);
    expect(gate.status).toBe("reject");
  });

  it("marks hospital meeting as conditional (not reject)", () => {
    const opts = ruleProposeOptions(
      sampleZhuTwin(),
      sampleZhuInsights(),
      [],
      [],
    );
    const gate = evaluateOptionsGate(opts, { complianceHitCount: 1 });
    expect(gate.status).not.toBe("reject");
    expect(["pass", "conditional"]).toContain(gate.status);
  });
});

describe("proposeOptions + chat (integration)", () => {
  beforeAll(async () => {
    await upsertTwin(sampleZhuTwin());
    await upsertInsights(sampleZhuInsights());
  });

  it("proposeOptions persists 3–5 options", async () => {
    const result = await proposeOptions({ hcpId: ZHU_HCP_ID });
    expect(result.runId).toMatch(/^eor_/);
    expect(result.options.length).toBeGreaterThanOrEqual(3);
    expect(result.options.length).toBeLessThanOrEqual(5);
    expect(result.gate_result?.status).toBeTruthy();
  }, 120_000);

  it("runComplianceGate returns structured status", async () => {
    const proposed = await proposeOptions({ hcpId: ZHU_HCP_ID });
    const gate = await runComplianceGate({
      hcpId: ZHU_HCP_ID,
      optionRunId: proposed.runId,
    });
    expect(["pass", "conditional", "reject"]).toContain(gate.status);
    expect(gate.gate_result.disclaimer).toMatch(/MLR/);
  }, 120_000);

  it("revise_options updates option and isolates mode", async () => {
    const proposed = await proposeOptions({ hcpId: ZHU_HCP_ID });
    const firstOpt = proposed.options[0]!;
    const revised = await chat({
      mode: "revise_options",
      hcpId: ZHU_HCP_ID,
      optionRunId: proposed.runId,
      optionId: firstOpt.id,
      message: "请把渠道改得更偏 MSL，并收紧合规旁注",
    });
    expect(revised.mode).toBe("revise_options");
    expect(revised.options?.[0]?.compliance_note).toBeTruthy();

    const open = await chat({
      mode: "open_chat",
      message: "国内唐氏综合征领域可关注哪些科室与机构？",
    });
    expect(open.mode).toBe("open_chat");
    expect(open.sessionId).not.toBe(revised.sessionId);
    expect(open.messages.at(-1)?.content).toBeTruthy();

    await expect(
      chat({
        mode: "open_chat",
        sessionId: revised.sessionId,
        message: "混用应失败",
      }),
    ).rejects.toMatchObject({ code: "CHAT_MODE_MISMATCH" });
  }, 120_000);
});
