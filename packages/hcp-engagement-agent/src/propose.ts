import { randomUUID } from "node:crypto";
import {
  EngagementOptionSchema,
  EngagementOptionsRunSchema,
  type EngagementOption,
  type EngagementOptionsRun,
  type EngagementRef,
} from "@hca/domain";
import { upsertEngagementOptions } from "@hca/db";
import type { RagChunk } from "@hca/medical-kb";
import { isLlmStrict } from "./config.js";
import { evaluateOptionsGate } from "./gate.js";
import {
  getTwinInsights,
  slimInsightsForPrompt,
  truncateChunks,
} from "./insights.js";
import { extractJsonArray } from "./json.js";
import { createLlmClient, type LlmClient } from "./llm.js";
import {
  retrieveAcademicForAgent,
  retrieveComplianceForAgent,
} from "./retrieve.js";
import { ruleProposeOptions } from "./rule-options.js";
import {
  agentError,
  ProposeOptionsInputSchema,
  type AgentError,
} from "./types.js";

const SYSTEM = `你是中国市场药企 HCP Engagement 助手（cn-hcp-pro 短模板）。
根据洞察与双路检索片段，生成 3–5 条 Engagement Options。
硬约束：
1. 不编造说明书外疗效；不用处方/统方/销量话术。
2. 院内会/讲者须写「机构同意 + 代表备案」旁注。
3. 不替代正式 MLR。
4. T1 偏 MSL；行政/政策角色慎促销渠道。
5. 每条须可映射到 opportunities/themes；带 academic_refs 与 compliance_refs（可用检索 id）。
只输出 JSON：{"options":[{id,label,action,owner,channel,theme,success_signal,compliance_note,priority,academic_refs:[{id,label}],compliance_refs:[{id,label}]}]}
priority 仅 P0|P1|P2；options 长度 3–5。`;

function chunkRefs(
  chunks: RagChunk[],
  kind: "academic" | "compliance",
): EngagementRef[] {
  return chunks.slice(0, 4).map((c) => ({
    id: c.clause_id || c.pmid || c.doi || c.id,
    label:
      kind === "compliance"
        ? `${c.authority ?? "compliance"}:${c.clause_id ?? c.id}`
        : `${c.specialty ?? c.source}${c.pmid ? ` PMID:${c.pmid}` : ""}`,
    source: c.source,
    score: c.score,
  }));
}

function normalizeOptions(
  raw: unknown,
  academic: RagChunk[],
  compliance: RagChunk[],
): EngagementOption[] {
  if (!Array.isArray(raw)) {
    throw agentError("LLM_ERROR", "options 不是数组", { retryable: true });
  }
  const aRefs = chunkRefs(academic, "academic");
  const cRefs = chunkRefs(compliance, "compliance");
  const out: EngagementOption[] = [];
  for (let i = 0; i < raw.length && out.length < 5; i++) {
    const item = raw[i];
    const draft = {
      id: `o${i + 1}`,
      label: `方案 ${i + 1}`,
      academic_refs: aRefs,
      compliance_refs: cRefs,
      ...(typeof item === "object" && item ? item : {}),
    };
    const parsed = EngagementOptionSchema.safeParse(draft);
    if (parsed.success) out.push(parsed.data);
  }
  if (out.length < 3) {
    throw agentError("LLM_ERROR", "有效方案少于 3 条", { retryable: true });
  }
  return out;
}

export type ProposeOptionsResult = {
  runId: string;
  options: EngagementOption[];
  gate_result: EngagementOptionsRun["gate_result"];
  run: EngagementOptionsRun;
};

/** I-AGT-002 proposeOptions — 薄主路径 */
export async function proposeOptions(
  raw: unknown,
  deps?: { llm?: LlmClient },
): Promise<ProposeOptionsResult> {
  const parsed = ProposeOptionsInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw agentError("VALIDATION_ERROR", "proposeOptions 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }
  const { hcpId, tenantId, productContext } = parsed.data;

  const bundle = await getTwinInsights(hcpId);
  const { twin, insights } = bundle;
  if (!(insights.opportunities?.length || twin.research?.themes?.length)) {
    throw agentError(
      "DOING_NOW_INPUT_INSUFFICIENT",
      "洞察/机会不足，拒绝空跑生成方案",
      {
        repair_hint: "先构建分身并确认洞察骨架，或合成一句话洞察后再试",
      },
    );
  }

  const name = twin.identity?.name_zh ?? twin.profile.name_zh;
  const themes = (twin.research?.themes ?? []).map(String).slice(0, 3);
  const academicQuery =
    themes.join(" ") || `${name} 学术交流` || "kidney transplant";
  const complianceQuery =
    "医药代表 学术推广 机构同意 备案 科室会 RDPAC 合规";

  let academic: RagChunk[] = [];
  let compliance: RagChunk[] = [];
  try {
    const [a, c] = await Promise.all([
      retrieveAcademicForAgent({
        query: academicQuery,
        specialty: twin.profile.specialties?.[0],
        top_k: 5,
      }),
      retrieveComplianceForAgent({
        query: complianceQuery,
        jurisdiction: "CN",
        tenant_id: tenantId,
        interaction_type: "academic_promotion",
        top_k: 5,
      }),
    ]);
    academic = a.chunks;
    compliance = c.chunks;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "RAG_UNAVAILABLE" || /qdrant|ECONNREFUSED/i.test(String(e?.message))) {
      throw agentError("RAG_UNAVAILABLE", "医学知识库不可用", {
        details: { message: e.message },
        retryable: true,
        repair_hint: "确认 Qdrant 与合规 seed 已就绪",
      });
    }
    // 检索软失败：继续规则提案，闸门将标附条件
    academic = [];
    compliance = [];
  }

  const llm =
    deps?.llm ??
    (() => {
      const c = createLlmClient();
      if ("error" in c) return null;
      return c;
    })();

  let options: EngagementOption[];
  let llmMeta: EngagementOptionsRun["llm"];

  if (!llm) {
    if (isLlmStrict()) {
      const c = createLlmClient();
      if ("error" in c) throw c.error;
    }
    options = ruleProposeOptions(twin, insights, academic, compliance);
  } else {
    try {
      const user = [
        `HCP 洞察（截断）：\n${slimInsightsForPrompt(bundle)}`,
        productContext ? `产品上下文：${productContext}` : "",
        `学术检索：\n${truncateChunks(academic) || "（无命中）"}`,
        `合规检索：\n${truncateChunks(compliance) || "（无命中）"}`,
        "请生成 options JSON。",
      ]
        .filter(Boolean)
        .join("\n\n");
      const result = await llm.chat([
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ]);
      const arr = extractJsonArray(result.content);
      options = normalizeOptions(arr, academic, compliance);
      llmMeta = { provider: result.provider, model: result.model };
    } catch (err) {
      if (isLlmStrict()) throw err as AgentError;
      options = ruleProposeOptions(twin, insights, academic, compliance);
    }
  }

  const gate_result = evaluateOptionsGate(options, {
    complianceHitCount: compliance.length,
  });
  if (
    compliance.length === 0 &&
    options.some((o) => /科室会|院内|讲者/.test(`${o.action}${o.channel}`))
  ) {
    // 敏感动作无合规命中：保留附条件，不硬拒（允许内部讨论）
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const run = EngagementOptionsRunSchema.parse({
    run_id: `eor_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    hcp_id: hcpId,
    options,
    gate_result,
    as_of: asOf,
    llm: llmMeta,
    meta: {
      academic_hit_count: academic.length,
      compliance_hit_count: compliance.length,
      product_context: productContext,
    },
  });

  await upsertEngagementOptions(run);

  return {
    runId: run.run_id,
    options: run.options,
    gate_result: run.gate_result,
    run,
  };
}
