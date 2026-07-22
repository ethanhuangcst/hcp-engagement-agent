import {
  GateResultSchema,
  type EngagementOption,
  type EngagementOptionsRun,
  type GateFinding,
  type GateResult,
} from "@hca/domain";
import {
  getEngagementOptionsRun,
  upsertEngagementOptions,
} from "@hca/db";
import {
  agentError,
  RunComplianceGateInputSchema,
} from "./types.js";

const FAIL_FAST_PATTERNS: { re: RegExp; rule: string; detail: string }[] = [
  {
    re: /最好|首选|唯一|绝对|保证治愈|特效/,
    rule: "绝对化 / 无依据最高级",
    detail: "含无法用说明书与证据支撑的绝对化或最高级表述",
  },
  {
    re: /统方|处方量|销量任务|带金销售|回扣/,
    rule: "医药代表办法负面清单",
    detail: "触及统方、销售任务或利益挂钩表述",
  },
  {
    re: /超适应症|off-?label促销|未获批适应症推广/,
    rule: "超适应症促销",
    detail: "疑似超说明书适应症促销表述",
  },
  {
    re: /对公众推销|直播带货|处方药广告/,
    rule: "处方药公众端变相推广",
    detail: "疑似对公众端的处方药促销路径",
  },
];

const CONDITIONAL_PATTERNS: { re: RegExp; rule: string; detail: string }[] = [
  {
    re: /科室会|院内会|学术推广|讲者|讲课费|顾问费|赞助/,
    rule: "院内学术推广程序",
    detail: "院内/讲者类互动须机构同意、代表备案与 FMV；输出须正式 MLR",
  },
  {
    re: /企微|公众号|社群推送/,
    rule: "数字化触达边界",
    detail: "企微/公众号内容须 MLR 版本与频控；禁止处方药公众促销话术",
  },
];

/** 旁注中的禁止性表述（「禁止统方」）不视为 Fail-fast 命中 */
function isProhibitionContext(text: string, matchIndex: number): boolean {
  const window = text.slice(Math.max(0, matchIndex - 4), matchIndex);
  return /禁止|不得|勿|避免|不/.test(window);
}

function scanText(text: string): {
  findings: GateFinding[];
  reject: boolean;
  conditional: boolean;
} {
  const findings: GateFinding[] = [];
  let reject = false;
  let conditional = false;
  for (const p of FAIL_FAST_PATTERNS) {
    const m = p.re.exec(text);
    if (!m || m.index === undefined) continue;
    if (isProhibitionContext(text, m.index)) continue;
    reject = true;
    findings.push({
      severity: "high",
      rule: p.rule,
      detail: p.detail,
      disposition: "拒绝并修订后再送",
    });
  }
  for (const p of CONDITIONAL_PATTERNS) {
    if (p.re.test(text)) {
      conditional = true;
      findings.push({
        severity: "medium",
        rule: p.rule,
        detail: p.detail,
        disposition: "附条件：写入合规旁注后可继续内部讨论",
      });
    }
  }
  return { findings, reject, conditional };
}

export function evaluateOptionsGate(
  options: EngagementOption[],
  opts?: { complianceHitCount?: number },
): GateResult {
  const asOf = new Date().toISOString().slice(0, 10);
  const findings: GateFinding[] = [];
  let reject = false;
  let conditional = false;

  for (const opt of options) {
    const blob = [
      opt.action,
      opt.theme,
      opt.success_signal,
      opt.compliance_note,
      opt.channel,
    ].join(" ");
    const r = scanText(blob);
    reject = reject || r.reject;
    conditional = conditional || r.conditional;
    findings.push(...r.findings);

    const sensitive = /科室会|院内|讲者|讲课|顾问|赞助/.test(blob);
    if (
      sensitive &&
      (opts?.complianceHitCount ?? opt.compliance_refs.length) === 0
    ) {
      conditional = true;
      findings.push({
        severity: "high",
        rule: "合规检索空命中",
        detail: `方案「${opt.label}」为敏感互动但缺少合规引用`,
        disposition: "标注需人工合规确认；不得当作已批准外发",
      });
    }
  }

  const must_keep_notes = [
    "须医疗卫生机构同意后再开展院内学术推广",
    "开展学术推广的医药代表须已备案",
    "本辅助闸门不替代正式 MLR 签批",
  ];

  const status = reject
    ? "reject"
    : conditional || findings.length > 0
      ? "conditional"
      : "pass";

  return GateResultSchema.parse({
    status,
    findings: dedupeFindings(findings),
    must_keep_notes,
    pending_human:
      status === "pass"
        ? []
        : ["客户 SOP / 说明书版本未在本系统核验时，须人工确认"],
    as_of: asOf,
  });
}

function dedupeFindings(findings: GateFinding[]): GateFinding[] {
  const seen = new Set<string>();
  const out: GateFinding[] = [];
  for (const f of findings) {
    const key = `${f.rule}|${f.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/** I-AGT-004 runComplianceGate */
export async function runComplianceGate(raw: unknown): Promise<{
  status: GateResult["status"];
  findings: GateFinding[];
  gate_result: GateResult;
  run: EngagementOptionsRun;
}> {
  const parsed = RunComplianceGateInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw agentError("VALIDATION_ERROR", "runComplianceGate 入参无效", {
      details: { issues: parsed.error.issues },
    });
  }
  const { hcpId, optionRunId, optionId } = parsed.data;
  const run = await getEngagementOptionsRun(optionRunId);
  if (!run || run.hcp_id !== hcpId) {
    throw agentError("OPTIONS_NOT_FOUND", "未找到 Engagement 方案运行", {
      details: { hcpId, optionRunId },
      repair_hint: "先生成一人一策方案",
    });
  }

  const options = optionId
    ? run.options.filter((o) => o.id === optionId)
    : run.options;
  if (options.length === 0) {
    throw agentError("OPTIONS_NOT_FOUND", "未找到指定方案选项", {
      details: { optionId },
    });
  }

  const gate_result = evaluateOptionsGate(options, {
    complianceHitCount: run.meta?.compliance_hit_count,
  });

  const next: EngagementOptionsRun = {
    ...run,
    gate_result,
    options: run.options.map((o) => {
      if (optionId && o.id !== optionId) return o;
      const noteExtra =
        gate_result.status === "pass"
          ? o.compliance_note
          : `${o.compliance_note}｜闸门：${gate_result.status}（不替代 MLR）`;
      return { ...o, compliance_note: noteExtra };
    }),
  };
  await upsertEngagementOptions(next);

  if (gate_result.status === "reject") {
    // 仍回写结果；调用方可按 code 处理
  }

  return {
    status: gate_result.status,
    findings: gate_result.findings,
    gate_result,
    run: next,
  };
}
