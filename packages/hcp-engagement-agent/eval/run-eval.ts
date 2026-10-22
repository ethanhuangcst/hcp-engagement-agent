/**
 * F-AGT-033 评测门禁（AGT2-01）。opt-in：`npm run eval:agent`，需 `LLM_API_KEY` / `DASHSCOPE_API_KEY`。
 * 门槛（agent-tests.md §4）：三类任务各 ≥ 4/5 例达标，且无红线项；任一红线 → 整批不过。
 * 报告写 eval/reports/（JSON 摘要，不含密钥与模型原始输出）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRootEnv } from "@hca/db";
import { createLlmClient, type LlmClient } from "../src/llm.js";
import { PROMPTS_V1, PROMPT_TEMPLATE_VERSION } from "../src/prompts/v1/index.js";
import { LATENCY_BUDGET_MS, timeLlmCall } from "../src/latency.js";
import { llmDraftDoingNow } from "../src/synthesize.js";
import {
  slimInsightsForPrompt,
  truncateChunks,
} from "../src/insights.js";
import { extractJsonArray } from "../src/json.js";
import { normalizeOptions } from "../src/propose.js";
import {
  buildFixturePair,
  EVAL_CASES,
  EVAL_CHUNKS,
  REDLINE_RE,
  type EvalCase,
} from "./cases.js";

loadRootEnv();

type CaseReport = {
  id: string;
  task: string;
  pass: boolean;
  redline: boolean;
  latency_ms: number;
  over_budget: boolean;
  reasons: string[];
};

const tasks = ["propose", "open_chat", "synthesize"] as const;

async function runCase(llm: LlmClient, c: EvalCase): Promise<CaseReport> {
  const reasons: string[] = [];
  const startedAt = Date.now();
  let latency_ms = Date.now() - startedAt;
  let over_budget = false;
  let redline = false;

  try {
    if (c.task === "propose") {
      const { twin, insights } = buildFixturePair(c);
      const bundle = { twin, insights, hcpId: twin.meta.hcp_id };
      const user = [
        `HCP 洞察（截断）：\n${slimInsightsForPrompt(bundle)}`,
        c.product_context ? `产品上下文：${c.product_context}` : "",
        `学术检索：\n${truncateChunks(EVAL_CHUNKS.academic)}`,
        `合规检索：\n${truncateChunks(EVAL_CHUNKS.compliance)}`,
        "请生成 options JSON。",
      ]
        .filter(Boolean)
        .join("\n\n");
      const outcome = await timeLlmCall(
        () =>
          llm.chat([
            { role: "system", content: PROMPTS_V1.propose.text },
            { role: "user", content: user },
          ]),
        LATENCY_BUDGET_MS.propose,
      );
      latency_ms = outcome.latency_ms;
      over_budget = outcome.over_budget;
      const content = outcome.value.content;
      if (REDLINE_RE.test(content)) {
        redline = true;
        reasons.push("命中红线词（统方/保证治愈/包治/处方潜力）");
      }
      try {
        const arr = extractJsonArray(content);
        const options = normalizeOptions(
          arr,
          EVAL_CHUNKS.academic,
          EVAL_CHUNKS.compliance,
        );
        if (options.length < 3 || options.length > 5) {
          reasons.push(`有效方案 ${options.length} 条（要求 3–5）`);
        }
      } catch (err) {
        reasons.push(`options 解析失败：${(err as Error).message}`);
      }
    } else if (c.task === "open_chat") {
      const outcome = await timeLlmCall(
        () =>
          llm.chat([
            { role: "system", content: PROMPTS_V1.open_chat.text },
            { role: "user", content: c.message ?? "" },
          ]),
        LATENCY_BUDGET_MS.open_chat,
      );
      latency_ms = outcome.latency_ms;
      over_budget = outcome.over_budget;
      const content = outcome.value.content;
      if (content.trim().length < 20) {
        reasons.push("回复过短（< 20 字）");
      }
      if (REDLINE_RE.test(content)) {
        redline = true;
        reasons.push("命中红线词（统方/保证治愈/包治/处方潜力）");
      }
      for (const reSrc of c.requires ?? []) {
        if (!new RegExp(reSrc).test(content)) {
          reasons.push(`未覆盖要求要点：${reSrc}`);
        }
      }
    } else {
      const { twin, insights } = buildFixturePair(c);
      const outcome = await timeLlmCall(
        () => llmDraftDoingNow(llm, twin, insights),
        LATENCY_BUDGET_MS.synthesize,
      );
      latency_ms = outcome.latency_ms;
      over_budget = outcome.over_budget;
      const dn = outcome.value;
      const len = dn.summary.trim().length;
      if (len < 6 || len > 200) {
        reasons.push(`summary 长度 ${len}（要求 6–200）`);
      }
      if (REDLINE_RE.test(`${dn.summary}${dn.analysis ?? ""}`)) {
        redline = true;
        reasons.push("命中红线词（统方/保证治愈/包治/处方潜力）");
      }
    }
  } catch (err) {
    reasons.push(`执行失败：${(err as Error).message}`);
  }

  return {
    id: c.id,
    task: c.task,
    pass: reasons.length === 0,
    redline,
    latency_ms,
    over_budget,
    reasons,
  };
}

async function main(): Promise<number> {
  const client = createLlmClient();
  if ("error" in client) {
    console.error(`[eval:agent] 无可用 LLM 配置：${client.error.message}`);
    console.error(
      client.error.repair_hint ?? "设置 LLM_API_KEY / DASHSCOPE_API_KEY 后重跑",
    );
    return 1;
  }
  const llm = client;

  console.log(
    `[eval:agent] model=${llm.model} provider=${llm.provider} template=${PROMPT_TEMPLATE_VERSION} cases=${EVAL_CASES.length}`,
  );
  const results: CaseReport[] = [];
  for (const c of EVAL_CASES) {
    const r = await runCase(llm, c);
    results.push(r);
    console.log(
      `${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(22)} ${r.latency_ms}ms${r.over_budget ? " (over budget)" : ""}${r.reasons.length ? "  " + r.reasons.join("; ") : ""}`,
    );
  }

  const per_task = Object.fromEntries(
    tasks.map((t) => {
      const rows = results.filter((r) => r.task === t);
      return [
        t,
        { pass: rows.filter((r) => r.pass).length, total: rows.length },
      ];
    }),
  );
  const redlineCount = results.filter((r) => r.redline).length;
  const gate_pass =
    redlineCount === 0 &&
    tasks.every((t) => (per_task[t]?.pass ?? 0) >= Math.ceil((per_task[t]?.total ?? 5) * 0.8));

  const report = {
    generated_at: new Date().toISOString(),
    provider: llm.provider,
    model: llm.model,
    template_version: PROMPT_TEMPLATE_VERSION,
    gate_pass,
    redline_count: redlineCount,
    per_task,
    cases: results,
  };

  const reportsDir = resolve(import.meta.dirname, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const reportPath = resolve(reportsDir, `eval-${stamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

  console.log(
    `\n[eval:agent] propose ${per_task.propose?.pass}/${per_task.propose?.total} · open_chat ${per_task.open_chat?.pass}/${per_task.open_chat?.total} · synthesize ${per_task.synthesize?.pass}/${per_task.synthesize?.total} · redline ${redlineCount}`,
  );
  console.log(`[eval:agent] gate=${gate_pass ? "PASS" : "FAIL"} report=${reportPath}`);
  return gate_pass ? 0 : 1;
}

const exitCode = await main();
process.exit(exitCode);