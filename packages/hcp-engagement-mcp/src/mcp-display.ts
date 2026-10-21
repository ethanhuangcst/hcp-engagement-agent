import type { McpError, VirtualTwin } from "@hca/domain";
import type { TwinListItem } from "@hca/db";

/** MCP 错误：content[0].text 给人读；structuredContent 保留 code 供程序判断 */
export function formatMcpErrorForDisplay(error: McpError): string {
  const lines: string[] = [error.message];
  if (error.repair_hint?.trim()) {
    lines.push(`下一步：${error.repair_hint.trim()}`);
  }
  if (error.retryable) {
    lines.push("此错误可稍后重试。");
  }
  return lines.join("\n");
}

const TEXT_TAIL =
  "说明：以上是给人看的摘要。程序若要 JSON，读 structuredContent，不必把 JSON 贴给用户。";

/** list_hcp：content[0].text 给人读的编号列表 */
export function formatListHcpForDisplay(body: {
  count: number;
  items: TwinListItem[];
}): string {
  const lines: string[] = ["=== list_hcp 结果 ===", ""];
  if (body.count === 0) {
    lines.push("库里还没有任何医生档案。");
  } else {
    lines.push(`库里共有 ${body.count} 位医生：`);
    body.items.forEach((t, i) => {
      lines.push(
        `  ${i + 1}. ${t.name_zh} | ${t.hospital} | ${t.department} | 编号 ${t.hcp_id}`,
      );
    });
  }
  lines.push("", TEXT_TAIL);
  return lines.join("\n");
}

/** add_hcp 保存成功体（与 server 组装字段对齐） */
export type AddHcpSavedBody = {
  twin: VirtualTwin;
  hcp_id: string;
  refresh?: { run_id: string };
  knowledge_jobs?: { specialty: string; jobId: string; knowledge_status: string }[];
  specialty_preview?: {
    input: string;
    specialty: string | null;
    matched: boolean;
    hint?: string;
  }[];
};

/** add_hcp 非错误信封：科室不一致需人工核对 */
export function formatDepartmentConfirmationForDisplay(body: {
  status: "department_confirmation_required";
  department_mismatch: { input_side: string; signal_side: string };
  repair_hint: string;
}): string {
  const lines = [
    "=== add_hcp 结果 ===",
    "",
    "未保存。你检索时填的科室，和公开数据推断的科室不一致：",
    `  你填的科室：${body.department_mismatch.input_side}`,
    `  公开数据推断的科室：${body.department_mismatch.signal_side}`,
    "",
    `下一步：${body.repair_hint}`,
    "",
    TEXT_TAIL,
  ];
  return lines.join("\n");
}

/** add_hcp 非错误信封：疑似同人需人工确认 */
export function formatDuplicateConfirmationForDisplay(body: {
  status: "confirmation_required";
  possible_duplicates: {
    hcp_id: string;
    name_zh: string;
    hospital: string;
    department: string;
  }[];
  truncated: boolean;
}): string {
  const lines = [
    "=== add_hcp 结果 ===",
    "",
    "未保存。库里已有疑似同一个人的档案：",
  ];
  body.possible_duplicates.forEach((d, i) => {
    lines.push(
      `  ${i + 1}. ${d.name_zh} | ${d.hospital} | ${d.department} | 编号 ${d.hcp_id}`,
    );
  });
  if (body.truncated) lines.push("  （类似档案较多，仅列出前 20 条）");
  lines.push(
    "",
    "下一步：若确认不是同一个人，重试时传 confirm_not_duplicate: true；若是同一个人，请直接使用上面已有编号。",
    "",
    TEXT_TAIL,
  );
  return lines.join("\n");
}

function knowledgeStatusZh(status: string): string {
  switch (status) {
    case "ready":
      return "已就绪";
    case "sparse":
      return "内容较少";
    case "pending":
      return "准备中";
    case "failed":
      return "准备失败";
    default:
      return status;
  }
}

/** add_hcp 保存成功：人话摘要 */
export function formatAddHcpSavedForDisplay(body: AddHcpSavedBody): string {
  const ident = body.twin.identity ?? body.twin.profile;
  const lines = [
    "=== add_hcp 结果 ===",
    "",
    "已保存新档案：",
    `  ${ident.name_zh} | ${ident.hospital} | ${ident.department}`,
    `  编号：${body.hcp_id}`,
  ];
  if (body.refresh) {
    lines.push(`  资料构建已开始（进度编号 ${body.refresh.run_id}）。`);
  }
  if (body.knowledge_jobs?.length) {
    lines.push("  知识库准备情况：");
    for (const job of body.knowledge_jobs) {
      lines.push(`    ${job.specialty}：${knowledgeStatusZh(job.knowledge_status)}`);
    }
  }
  if (body.specialty_preview?.length) {
    lines.push("  科室与专长的知识预灌预览：");
    for (const row of body.specialty_preview) {
      lines.push(
        row.matched
          ? `    ${row.input}：将预灌对应专科知识库`
          : `    ${row.input}：无法对应受控专科，将跳过知识预灌`,
      );
    }
  }
  lines.push("  本次保存用的候选令牌已失效（每次保存只能用一次）。");
  lines.push("", TEXT_TAIL);
  return lines.join("\n");
}
