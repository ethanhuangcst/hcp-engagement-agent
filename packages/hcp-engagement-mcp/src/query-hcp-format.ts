import type { VirtualTwin } from "@hca/domain";
import { specialtyDisplayName } from "@hca/hcp-engagement-agent";

/** query_hcp 返回体中的库外候选摘要（与 server 映射字段对齐） */
export type QueryHcpExternalItem = {
  candidate_id: string;
  name_zh: string;
  name_en?: string;
  hospital: string;
  department: string;
  distinguish?: string;
  match_note: string;
  confidence: string;
  department_signal?: { topics?: string[]; specialty?: string };
  department_mismatch?: { input_side: string; signal_side: string };
};

export type QueryHcpResultBody = {
  count: number;
  items: VirtualTwin[];
  external?: {
    count: number;
    items: QueryHcpExternalItem[];
    notice?: string;
  };
};

function twinLine(twin: VirtualTwin, index: number): string {
  const id = twin.meta.hcp_id;
  const ident = twin.identity ?? twin.profile;
  const parts = [
    `${index}.`,
    ident.name_zh,
    ident.hospital,
    ident.department,
    `(hcp_id=${id})`,
  ];
  return parts.join(" | ");
}

function externalLine(c: QueryHcpExternalItem, index: number): string[] {
  const lines: string[] = [];
  const conf =
    c.confidence === "high"
      ? "匹配较稳"
      : c.confidence === "medium"
        ? "需核对"
        : c.confidence;
  lines.push(
    `${index}. ${c.name_zh}${c.name_en ? `（${c.name_en}）` : ""} | ${conf}`,
  );
  lines.push(`   医院：${c.hospital} · 检索科室：${c.department}`);
  if (c.distinguish) lines.push(`   区分：${c.distinguish}`);
  lines.push(`   依据：${c.match_note}`);
  // feature-12 跟进（B+ 设计）：卡片列出记录自身的主题词，人可据此分辨与核对
  const topics = (c.department_signal?.topics ?? []).slice(0, 8);
  if (topics.length > 0) lines.push(`   主题词：${topics.join("、")}`);
  const specKey = c.department_signal?.specialty;
  const ingestZh = specKey ? specialtyDisplayName(specKey) : undefined;
  if (specKey && ingestZh && c.department_mismatch) {
    lines.push(
      `   科室判断：公开数据指向 ${ingestZh}，与你输入的 ${c.department} 不一致`,
    );
    lines.push(
      `   是否按 ${ingestZh} 入库？确认后在 add_hcp 传 confirm_department_checked: true`,
    );
  } else if (specKey && ingestZh) {
    lines.push(
      `   科室判断：公开数据指向 ${ingestZh}，与输入一致；保存后档案科室为 ${ingestZh}`,
    );
  } else if (specKey && !ingestZh) {
    lines.push(
      "   保存：公开数据给出了专科代号但系统无法转成中文科室名，保存时可能被拒绝",
    );
  } else {
    lines.push(
      "   保存：公开数据推不出标准科室，保存会被拒绝，不会写入数据库",
    );
  }
  lines.push(`   保存用的候选令牌：${c.candidate_id}`);
  return lines;
}

/**
 * MCP text 内容：给人读的列表摘要。完整结构仍在 structuredContent。
 */
export function formatQueryHcpForDisplay(body: QueryHcpResultBody): string {
  const lines: string[] = [];
  lines.push("=== query_hcp 结果 ===");
  lines.push("");
  lines.push(`【库内已保存】${body.count} 条`);
  if (body.count === 0) {
    lines.push("  （无匹配）");
  } else {
    body.items.forEach((t, i) => lines.push(`  ${twinLine(t, i + 1)}`));
  }
  if (body.external) {
    lines.push("");
    const notice = body.external.notice?.trim();
    lines.push(
      `【库外候选】${body.external.count} 条${notice ? ` · ${notice}` : ""}`,
    );
    if (body.external.count === 0) {
      lines.push("  （无）");
    } else {
      body.external.items.forEach((c, i) => {
        for (const sub of externalLine(c, i + 1)) {
          lines.push(`  ${sub}`);
        }
        if (i < body.external!.items.length - 1) lines.push("");
      });
    }
  }
  lines.push("");
  lines.push(
    "说明：以上是给人看的摘要。程序若要 JSON，读 structuredContent，不必把 JSON 贴给用户。",
  );
  return lines.join("\n");
}
