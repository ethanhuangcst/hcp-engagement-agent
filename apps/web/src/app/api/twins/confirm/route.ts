import { z } from "zod";
import { getMcp } from "@/lib/mcp";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import {
  triggerKnowledgeIngest,
  resolveSpecialtyPreview,
  specialtyDisplayName,
} from "@/lib/rag-ingest";

const Schema = z.object({
  hcpId: z.string().min(1),
  name_zh: z.string().min(1).optional(),
  name_en: z.string().nullable().optional(),
  hospital: z.string().min(1).optional(),
  /** 调用方输入科室：仅检索提示，入库科室由 department_signal 决定（MCP2-10 / DEF-006，D2） */
  department: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  city: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  author_ids_draft: z
    .record(z.string(), z.string().nullable().optional())
    .optional(),
  tags_draft: z
    .object({
      hcp_tier: z.string().optional(),
      role_tags: z.array(z.string()).optional(),
      specialties: z.array(z.string()).optional(),
    })
    .optional(),
  /** MCP2-10（DEF-006，D2）：选中候选的科室信号与 mismatch（BFF 侧闸门同 add_hcp 规则） */
  department_signal: z
    .object({
      topics: z.array(z.string()).optional(),
      specialty: z.string().optional(),
    })
    .optional(),
  department_mismatch: z
    .object({
      input_side: z.string(),
      signal_side: z.string(),
    })
    .optional(),
  confirm_department_checked: z.boolean().optional(),
});

export async function POST(req: Request) {
  loadRootEnv();
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      { code: "VALIDATION_ERROR", message: "缺少 hcpId" },
      400,
    );
  }
  /**
   * feature-12（MCP2-10 / DEF-006，D2）三分支闸门，与 add_hcp 同规则（mcp2-design §13.6）：
   * 无信号专科 → 阻断；mismatch 未人工确认 → 返回 department_confirmation_required；放行 → 入库科室取信号侧中文名。
   */
  const signalKey = parsed.data.department_signal?.specialty?.trim();
  const ingestDepartment = signalKey
    ? specialtyDisplayName(signalKey)
    : undefined;
  if (!ingestDepartment) {
    return jsonError(
      {
        code: "VALIDATION_ERROR",
        message: "选中记录无信号专科，阻断保存",
        details: { code: "DEPARTMENT_SIGNAL_MISSING" },
        repair_hint:
          "换检索条件重新查询检出带科室信号的候选，或人工核实该医生科室后再试",
      },
      400,
    );
  }
  if (parsed.data.department_mismatch && !parsed.data.confirm_department_checked) {
    return jsonOk({
      status: "department_confirmation_required",
      department_mismatch: parsed.data.department_mismatch,
      repair_hint:
        "输入科室与数据源信号不一致；请勾选「已人工核对科室」后重新保存（入库科室将取数据源信号侧）",
    });
  }
  try {
    const result = await getMcp().confirmAndSaveTwin({
      ...parsed.data,
      department: ingestDepartment,
      extra_evidence_refs: [
        "department_signal",
        ...(parsed.data.department_mismatch ? ["department_checked"] : []),
      ],
    });
    if (!result.ok) return jsonError(result.error, 400);
    let knowledge_jobs: Awaited<ReturnType<typeof triggerKnowledgeIngest>> = [];
    try {
      knowledge_jobs = await triggerKnowledgeIngest({
        hcpId: parsed.data.hcpId,
        department: ingestDepartment,
        specialties: parsed.data.specialties,
        themes: parsed.data.themes,
        tags_draft: parsed.data.tags_draft,
      });
    } catch {
      /* fire-and-forget: confirm must not fail on ingest errors */
    }
    // MCP2-09（DEF-005）：与上方 triggerKnowledgeIngest 同一输入同一归一化核心，预览与实际预灌一致
    // feature-12（MCP2-10）：department 行以入库科室（信号专科中文名）为输入，与 add_hcp 同源
    const specialty_preview = resolveSpecialtyPreview({
      department: ingestDepartment,
      specialties: parsed.data.specialties,
      themes: parsed.data.themes,
      tags_draft: parsed.data.tags_draft,
    });
    return jsonOk({
      ...(result.data as object),
      knowledge_jobs,
      specialty_preview,
    });
  } catch (err) {
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        repair_hint: "确认 hcp-twin-mcp 已启动且 DATABASE_URL 可达",
      },
      502,
    );
  }
}
