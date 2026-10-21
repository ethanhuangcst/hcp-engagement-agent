import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  confirmAndSaveTwin as defaultConfirmAndSave,
  listTwins as defaultListTwinsFn,
  nameMatches,
  queryTwins as defaultQueryTwinsFn,
  getTwin as defaultGetTwin,
  getInsights as defaultGetInsights,
  type ConfirmAndSaveInput,
  type ConfirmAndSaveResult,
  type QueryTwinsResult,
  type QueryTwinsInput,
  type TwinListItem,
} from "@hca/db";
import { createMcpClient } from "@hca/mcp-client";
import { mcpError, type HcpInsights, type VirtualTwin } from "@hca/domain";
import {
  ensureDoingNow as defaultEnsureDoingNow,
  retrieveAcademicForAgent as defaultRetrieveAcademic,
  triggerKnowledgeIngest as defaultTriggerKnowledgeIngest,
  resolveSpecialtiesForIngest,
  resolveSpecialtyPreview,
  AGENT_GENERAL_HCP_ID,
  type EnsureDoingNowResult,
  type KnowledgeJobRef,
  type RagChunk,
  type RagCoverage,
} from "@hca/hcp-engagement-agent";
import {
  CandidateStore,
  type CandidatePayload,
  type DepartmentProvenance,
  type DepartmentSignal,
  type DepartmentMismatch,
} from "./candidate-store.js";

/** Sprint 1 注册的对外工具名（task-01 验收口径） */
export const SPRINT1_TOOLS = ["list_hcp", "query_hcp", "add_hcp"] as const;

export type QueryTwinsFn = (input: QueryTwinsInput) => Promise<QueryTwinsResult>;

export type ListTwinsFn = () => Promise<TwinListItem[]>;

/** 对内 resolve_hcp_identity 返回的候选（字段为 mcp/mcp-function-spec I-MCP-001 子集） */
export type ResolveCandidateInput = {
  candidate_id?: string;
  name_zh: string;
  name_en?: string | null;
  hospital: string;
  department: string;
  title?: string | null;
  distinguish?: string;
  match_note?: string;
  confidence?: string;
  /** MCP2-09（DEF-005）：twin-mcp resolve 候选的科室来源标注与数据源对照（可选，向后兼容） */
  department_provenance?: DepartmentProvenance;
  department_signal?: DepartmentSignal;
  department_mismatch?: DepartmentMismatch;
  hcpId?: string;
  author_ids_draft?: Record<string, string | null | undefined>;
};

/** ADR-010：query_hcp include_external 的外部源注入（缺省经 @hca/mcp-client 走 MCP_URL） */
export type ResolveIdentityFn = (input: {
  name: string;
  hospital: string;
  dept: string;
  city?: string;
}) => Promise<ResolveCandidateInput[]>;

/** ADR-009/010：add_hcp 写库注入（缺省 @hca/db confirmAndSaveTwin） */
export type AddHcpFn = (input: ConfirmAndSaveInput) => Promise<ConfirmAndSaveResult>;

/** ADR-013：add_hcp 写库成功后异步触发对内 build_twin（缺省经 @hca/mcp-client 走 MCP_URL） */
export type TriggerBuildFn = (input: {
  hcpId: string;
  mode: "incremental";
}) => Promise<{ runId: string }>;

/** ADR-013：get_hcp_insights 读 twin（缺省 @hca/db getTwin） */
export type GetTwinFn = (hcpId: string) => Promise<VirtualTwin | null>;

/** ADR-013：get_hcp_insights 读 insights（缺省 @hca/db getInsights） */
export type GetInsightsFn = (hcpId: string) => Promise<HcpInsights | null>;

/** ADR-013：get_hcp_insights 按需合成（缺省 @hca/hcp-engagement-agent ensureDoingNow） */
export type EnsureDoingNowFn = (hcpId: string) => Promise<EnsureDoingNowResult>;

/** ADR-012：retrieve_academic 学术检索（缺省 @hca/hcp-engagement-agent retrieveAcademicForAgent） */
export type RetrieveAcademicFn = (input: {
  query: string;
  specialty?: string;
  themes?: string[];
}) => Promise<{ chunks: RagChunk[]; coverage?: RagCoverage }>;

/** ADR-014：add_hcp 预灌触发（缺省 @hca/hcp-engagement-agent triggerKnowledgeIngest） */
export type TriggerIngestFn = (input: {
  specialties?: string[];
  themes?: string[];
  department?: string;
  hcpId?: string;
}) => Promise<KnowledgeJobRef[]>;

function stubNotImplemented(tool: string, feature: string) {
  const error = mcpError(
    "INTERNAL_ERROR",
    `${tool} 尚未实现：业务逻辑由 ${feature} 落地`,
    {
      repair_hint: `等待 ${feature} 交付后调用`,
      details: { tool, stub: true },
      retryable: false,
    },
  );
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify({ error }) }],
    structuredContent: { error },
  };
}

function mcpErrorResult(error: ReturnType<typeof mcpError>) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify({ error }) }],
    structuredContent: { error },
  };
}

function textResult(body: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body) }],
    structuredContent: body,
  };
}

async function defaultResolveIdentity(
  input: Parameters<ResolveIdentityFn>[0],
): Promise<ResolveCandidateInput[]> {
  const client = createMcpClient(internalMcpUrl());
  try {
    const res = await client.resolveHcpIdentity({
      name: input.name,
      hospital: input.hospital,
      dept: input.dept,
      city: input.city,
    });
    if (!res.ok) {
      throw new Error(
        `resolve_hcp_identity 失败：${
          (res.error as { message?: string } | undefined)?.message ?? "未知错误"
        }`,
      );
    }
    const data = res.data as { candidates?: ResolveCandidateInput[] } | undefined;
    return Array.isArray(data?.candidates) ? (data?.candidates ?? []) : [];
  } finally {
    await client.close().catch(() => {});
  }
}

/** ADR-010：MCP_URL 允许只配 origin（如 http://127.0.0.1:3200），无路径时补 /mcp */
export function internalMcpUrl(
  raw: string = process.env.MCP_URL ?? "http://127.0.0.1:3200/mcp",
): string {
  try {
    const url = new URL(raw);
    if (url.pathname === "/" || url.pathname === "") url.pathname = "/mcp";
    return url.toString();
  } catch {
    return raw;
  }
}

/** ADR-013：MCP_URL 触发对内 build_twin（incremental，保留 user_override F-MCP-029） */
async function defaultTriggerBuild(
  input: Parameters<TriggerBuildFn>[0],
): Promise<{ runId: string }> {
  const client = createMcpClient(internalMcpUrl());
  try {
    const res = await client.buildTwin({
      hcpId: input.hcpId,
      mode: input.mode,
    });
    if (!res.ok) {
      throw new Error(
        `build_twin 失败：${
          (res.error as { message?: string } | undefined)?.message ?? "未知错误"
        }`,
      );
    }
    const runId = (res.data as { runId?: string } | undefined)?.runId;
    if (!runId || typeof runId !== "string") {
      throw new Error("build_twin 返回缺少 runId");
    }
    return { runId };
  } finally {
    await client.close().catch(() => {});
  }
}

function twinIdentityOf(twin: VirtualTwin) {
  return (
    twin.identity ?? {
      name_zh: twin.profile.name_zh,
      name_en: twin.profile.name_en,
      hospital: twin.profile.hospital,
      department: twin.profile.department,
      city: twin.profile.city,
      title: twin.profile.title,
    }
  );
}

export type CreateMcpServerOptions = {
  /** 测试注入；缺省走 @hca/db queryTwins */
  queryTwins?: QueryTwinsFn;
  /** 测试注入；缺省走 @hca/db listTwins */
  listTwins?: ListTwinsFn;
  /** 测试注入；缺省经 @hca/mcp-client 调对内 resolve_hcp_identity（MCP_URL） */
  resolveIdentity?: ResolveIdentityFn;
  /** 测试注入；缺省走 @hca/db confirmAndSaveTwin */
  addHcp?: AddHcpFn;
  /** ADR-013：测试注入；缺省经 @hca/mcp-client 调对内 build_twin（MCP_URL） */
  triggerBuild?: TriggerBuildFn;
  /** 测试注入；缺省进程内新建（ADR-010 令牌缓存） */
  candidateStore?: CandidateStore;
  /** ADR-013：测试注入；缺省走 @hca/db getTwin */
  getTwin?: GetTwinFn;
  /** ADR-013：测试注入；缺省走 @hca/db getInsights */
  getInsights?: GetInsightsFn;
  /** ADR-013：测试注入；缺省走 @hca/hcp-engagement-agent ensureDoingNow */
  ensureDoingNow?: EnsureDoingNowFn;
  /** ADR-012：测试注入；缺省走 @hca/hcp-engagement-agent retrieveAcademicForAgent */
  retrieveAcademic?: RetrieveAcademicFn;
  /** ADR-014：测试注入；缺省走 @hca/hcp-engagement-agent triggerKnowledgeIngest */
  triggerIngest?: TriggerIngestFn;
};

function candidatePayloadOf(c: ResolveCandidateInput): CandidatePayload {
  const openalex = c.author_ids_draft?.openalex;
  return {
    hcp_id: c.hcpId ?? (openalex ? `hcp_${openalex.toLowerCase()}` : ""),
    name_zh: c.name_zh,
    name_en: c.name_en ?? undefined,
    hospital: c.hospital,
    department: c.department,
    title: c.title ?? undefined,
    author_ids: c.author_ids_draft,
    source_candidate_id: c.candidate_id,
    department_provenance: c.department_provenance,
    department_signal: c.department_signal,
    department_mismatch: c.department_mismatch,
  };
}

export function createMcpServer(options?: CreateMcpServerOptions): McpServer {
  const runQuery = options?.queryTwins ?? defaultQueryTwinsFn;
  const runList = options?.listTwins ?? defaultListTwinsFn;
  const runResolve = options?.resolveIdentity ?? defaultResolveIdentity;
  const runAdd = options?.addHcp ?? defaultConfirmAndSave;
  const runTriggerBuild = options?.triggerBuild ?? defaultTriggerBuild;
  const runGetTwin = options?.getTwin ?? defaultGetTwin;
  const runGetInsights = options?.getInsights ?? defaultGetInsights;
  const runEnsureDoingNow: EnsureDoingNowFn =
    options?.ensureDoingNow ?? ((hcpId) => defaultEnsureDoingNow({ hcpId }));
  const runRetrieveAcademic: RetrieveAcademicFn =
    options?.retrieveAcademic ?? ((input) => defaultRetrieveAcademic(input));
  const runTriggerIngest: TriggerIngestFn =
    options?.triggerIngest ?? ((input) => defaultTriggerKnowledgeIngest(input));
  const tokens = options?.candidateStore ?? new CandidateStore();

  const server = new McpServer(
    { name: "hcp-engagement-mcp", version: "0.1.0" },
    { instructions: "HCP engagement 对外 MCP 2.0。提供 list_hcp、query_hcp、add_hcp、get_hcp_insights、retrieve_academic 五个工具。" },
  );

  server.registerTool(
    "list_hcp",
    {
      description:
        "列出库内全部 HCP（不含 _agent_general），无分页。返回 {count, items}。",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const items = await runList();
        const body = { count: items.length, items };
        return textResult(body);
      } catch {
        return mcpErrorResult(
          mcpError("INTERNAL_ERROR", "list_hcp 读取列表失败", {
            repair_hint: "检查 DATABASE_URL 与数据库连通性后重试",
            retryable: true,
          }),
        );
      }
    },
  );

  server.registerTool(
    "query_hcp",
    {
      description:
        "按 hcp_id 或 name 查询单个 HCP（至少传其一），可用 hospital/department/city 消歧。include_external 为 true 时同步检索库外候选并签发 candidate_id（约 30 分钟有效，仅用于 add_hcp）。",
      inputSchema: {
        hcp_id: z.string().optional().describe("HCP 主键 ID"),
        name: z
          .string()
          .optional()
          .describe(
            "HCP 姓名：中文精确；英文/拼音；名在前或「姓, 名」；连字符与撇号忽略；行首 Dr/Prof/MD 忽略；长度≥6 的拉丁全名允许 1 次拼写差异（含倒序之后）",
          ),
        hospital: z.string().optional().describe("医院名，用于同名消歧（支持短式包含）"),
        department: z.string().optional().describe("科室，用于同名消歧（支持短式包含）"),
        city: z.string().optional().describe("城市，用于同名消歧"),
        include_external: z
          .boolean()
          .optional()
          .describe(
            "是否一并检索库外候选（默认 false）。为 true 须同时传 name、hospital、department；外部源失败时降级为仅库内并附提示",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      if (!args.hcp_id && !args.name) {
        return mcpErrorResult(
          mcpError("VALIDATION_ERROR", "query_hcp 需要 hcp_id 或 name 至少传一", {
            repair_hint: "补充 hcp_id 或 name 后重试",
            retryable: false,
          }),
        );
      }
      try {
        const result = await runQuery({
          hcp_id: args.hcp_id,
          name: args.name,
          hospital: args.hospital,
          department: args.department,
          city: args.city,
        });
        if (!result.found) {
          return mcpErrorResult(
            mcpError("NOT_FOUND", "未找到匹配的 HCP", {
              repair_hint: "检查 hcp_id 或放宽 name / 医院 / 科室 / 城市条件",
              retryable: false,
            }),
          );
        }
        const body: {
          count: number;
          items: VirtualTwin[];
          external?: {
            count: number;
            items: unknown[];
            notice?: string;
          };
        } = { count: result.items.length, items: result.items };

        if (args.include_external) {
          const canResolve =
            !!args.name &&
            !!args.hospital?.trim() &&
            !!args.department?.trim();
          if (!canResolve) {
            body.external = {
              count: 0,
              items: [],
              notice:
                "库外检索需要同时提供 name、hospital 与 department；本次仅返回库内结果",
            };
          } else {
            try {
              const candidates = await runResolve({
                name: args.name!,
                hospital: args.hospital!,
                dept: args.department!,
                city: args.city,
              });
              const survivors = candidates.filter((c) => {
                if (!c.hcpId) return true;
                if (result.items.some((t) => t.meta.hcp_id === c.hcpId)) {
                  return false;
                }
                const zhHit = result.items.some((t) =>
                  nameMatches(c.name_zh, twinIdentityOf(t)),
                );
                const enHit =
                  c.name_en &&
                  result.items.some((t) =>
                    nameMatches(c.name_en!, twinIdentityOf(t)),
                  );
                return !(zhHit || enHit);
              });
              const externalItems = survivors.map((c) => {
                const payload = candidatePayloadOf(c);
                const token = tokens.issue(payload);
                return {
                  candidate_id: token,
                  name_zh: c.name_zh,
                  name_en: c.name_en ?? undefined,
                  hospital: c.hospital,
                  department: c.department,
                  title: c.title ?? undefined,
                  distinguish: c.distinguish,
                  match_note: c.match_note,
                  confidence: c.confidence,
                  source: "hcp-twin-mcp",
                  source_candidate_id: c.candidate_id,
                  // MCP2-09（DEF-005）：科室来源标注与数据源对照原样透传（旧候选无字段时不报错）
                  ...(c.department_provenance
                    ? { department_provenance: c.department_provenance }
                    : {}),
                  ...(c.department_signal
                    ? { department_signal: c.department_signal }
                    : {}),
                  ...(c.department_mismatch
                    ? { department_mismatch: c.department_mismatch }
                    : {}),
                  source_ids: c.author_ids_draft
                    ? {
                        openalex: c.author_ids_draft.openalex ?? undefined,
                        orcid: c.author_ids_draft.orcid ?? undefined,
                        pubmed_author: c.author_ids_draft.pubmed_author ?? undefined,
                      }
                    : undefined,
                };
              });
              body.external = { count: externalItems.length, items: externalItems };
            } catch {
              body.external = {
                count: 0,
                items: [],
                notice: "库外检索暂不可用，已降级为仅库内结果",
              };
            }
          }
        }
        return textResult(body);
      } catch {
        return mcpErrorResult(
          mcpError("INTERNAL_ERROR", "query_hcp 查询失败", {
            repair_hint: "检查 DATABASE_URL 与数据库连通性后重试",
            retryable: true,
          }),
        );
      }
    },
  );

  server.registerTool(
    "add_hcp",
    {
      description:
        "新增 HCP 档案（写库、非幂等；写库成功后异步触发 incremental build）。仅接受 query_hcp 检出、经人选认的库外候选：传 candidate_id（必填，约 30 分钟有效，写入成功即作废）；可选 confirm_not_duplicate 确认疑似同人确非重复。身份字段由候选载荷生成，不接受直传。写库成功时返回 refresh.run_id 与 specialty_preview（科室 → 将预灌专科映射预览，与实际预灌同源；matched 为 false 的科室附 hint 且预灌跳过），可用 Web 构建进度页或对内 get_twin_status 查询进度；触发失败不影响新增结果（返回体不含 refresh / knowledge_jobs 键）。",
      inputSchema: {
        candidate_id: z
          .string()
          .min(1)
          .describe("候选令牌：来自 query_hcp include_external 库外候选，经人选认后传入"),
        confirm_not_duplicate: z
          .boolean()
          .optional()
          .describe(
            "上一次返回 confirmation_required 且人工确认非重复时置 true 强制写入",
          ),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => {
      const payload = tokens.get(args.candidate_id);
      if (!payload) {
        return mcpErrorResult(
          mcpError("NOT_FOUND", "候选令牌不存在、已过期或已使用", {
            repair_hint: "重新调用 query_hcp（include_external: true）检出候选，经人选认后重试",
            retryable: false,
          }),
        );
      }
      try {
        const result = await runAdd({
          hcp_id: payload.hcp_id,
          name_zh: payload.name_zh,
          name_en: payload.name_en ?? null,
          hospital: payload.hospital,
          department: payload.department,
          title: payload.title ?? null,
          city: payload.city,
          author_ids: payload.author_ids,
          confirm_not_duplicate: args.confirm_not_duplicate,
        });
        if (result.status === "invalid") {
          return mcpErrorResult(
            mcpError(result.code, result.message, {
              repair_hint: result.repair_hint,
              retryable: false,
            }),
          );
        }
        if (result.status === "confirmation_required") {
          return textResult({
            status: result.status,
            possible_duplicates: result.possible_duplicates,
            truncated: result.truncated,
          });
        }
        tokens.invalidate(args.candidate_id);
        /** ADR-013：写库成功后异步触发对内 build；触发失败不影响新增结果 */
        let refresh: { run_id: string } | undefined;
        try {
          const r = await runTriggerBuild({
            hcpId: result.hcp_id,
            mode: "incremental",
          });
          refresh = { run_id: r.runId };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            JSON.stringify({
              event: "add_hcp_trigger_build_failed",
              hcp_id: result.hcp_id,
              message,
            }),
          );
        }
        /** ADR-014：写库成功后按受控专科预灌知识库（与 Web confirm 同源）；失败不影响新增 */
        let knowledgeJobs: KnowledgeJobRef[] | undefined;
        const twin = result.twin;
        const ingestInput = {
          specialties: twin.profile?.specialties ?? [],
          themes: twin.research?.themes ?? [],
          department: twin.profile?.department ?? "",
          hcpId: result.hcp_id,
        };
        const ingestKeys = resolveSpecialtiesForIngest(ingestInput);
        try {
          if (ingestKeys.length > 0) {
            knowledgeJobs = await runTriggerIngest({
              ...ingestInput,
              specialties: ingestKeys,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            JSON.stringify({
              event: "add_hcp_trigger_ingest_failed",
              hcp_id: result.hcp_id,
              message,
            }),
          );
        }
        /** MCP2-09（DEF-005）：科室 → 将预灌专科映射预览；与预灌同一 resolveSpecialtiesForIngest 同源结果，确认者当场发现科室错标 */
        const previewRows = resolveSpecialtyPreview(ingestInput).map((row) => ({
          ...row,
          ...(row.matched
            ? {}
            : { hint: "无法映射到受控专科，知识预灌将跳过该科室" }),
        }));
        return textResult({
          twin: result.twin,
          hcp_id: result.hcp_id,
          ...(refresh ? { refresh } : {}),
          ...(knowledgeJobs && knowledgeJobs.length > 0
            ? { knowledge_jobs: knowledgeJobs }
            : {}),
          ...(previewRows.length > 0 ? { specialty_preview: previewRows } : {}),
        });
      } catch {
        return mcpErrorResult(
          mcpError("INTERNAL_ERROR", "add_hcp 写库失败", {
            repair_hint: "检查 DATABASE_URL 与数据库连通性后重试",
            retryable: true,
          }),
        );
      }
    },
  );

  server.registerTool(
    "get_hcp_insights",
    {
      description:
        "读取单个 HCP 的公开分身与洞察（返回 { twin, insights }）。doing_now 已存在时纯读返回；doing_now 为空且事实足够时按需合成一次并写回缓存（insights.synthesized: true，仅首次）；事实不足或 LLM 暂不可用时返回空模板 insights.pending: true 加 repair_hint，不是错误。hcp_id 不存在或为通用智能体编号时返回 NOT_FOUND。本工具可能写库（幂等缓存回填），非只读。",
      inputSchema: {
        hcp_id: z.string().min(1).describe("HCP 主键 ID"),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        const twin = await runGetTwin(args.hcp_id);
        if (!twin || twin.meta.hcp_id === AGENT_GENERAL_HCP_ID) {
          return mcpErrorResult(
            mcpError("NOT_FOUND", "未找到该编号的 HCP", {
              repair_hint: "先用 query_hcp 按 name 或 hcp_id 确认编号后重试",
              retryable: false,
            }),
          );
        }
        const insights = await runGetInsights(args.hcp_id);
        /** 纯读路径：doing_now 已存在，不调 LLM、不写库 */
        if (insights?.doing_now?.summary?.trim()) {
          return textResult({ twin, insights });
        }
        const ensured = await runEnsureDoingNow(args.hcp_id);
        if (ensured.status === "ready") {
          const fresh = await runGetInsights(args.hcp_id);
          const body = fresh ?? emptyInsightsTemplate(twin, ensured.doing_now);
          return textResult({ twin, insights: { ...body, synthesized: true } });
        }
        const template = insights ?? emptyInsightsTemplate(twin);
        return textResult({
          twin,
          insights: {
            ...template,
            pending: true,
            repair_hint: repairHintFor(ensured.reason),
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({
            event: "get_hcp_insights_failed",
            hcp_id: args.hcp_id,
            message,
          }),
        );
        return mcpErrorResult(
          mcpError("INTERNAL_ERROR", "get_hcp_insights 读取失败", {
            repair_hint: "检查 DATABASE_URL 与数据库连通性后重试",
            retryable: true,
          }),
        );
      }
    },
  );

  server.registerTool(
    "retrieve_academic",
    {
      description:
        "按 HCP 检索学术证据（返回 { chunks }，每条含 source、doi、pmid、year 等引用字段）。query、specialty、themes 可选：只传 hcp_id 时按分身研究主题自动组装检索词。纯读、不写库、不生成方案。hcp_id 不存在或为通用智能体编号时返回 NOT_FOUND；知识库不可用时返回 INTERNAL_ERROR。",
      inputSchema: {
        hcp_id: z.string().min(1).describe("HCP 主键 ID"),
        query: z.string().optional().describe("检索词；缺省按分身研究主题组装"),
        specialty: z
          .string()
          .optional()
          .describe("专长过滤；缺省用分身第一个专长"),
        themes: z
          .array(z.string())
          .optional()
          .describe("主题过滤，透传底层检索"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const twin = await runGetTwin(args.hcp_id);
        if (!twin || twin.meta.hcp_id === AGENT_GENERAL_HCP_ID) {
          return mcpErrorResult(
            mcpError("NOT_FOUND", "未找到该编号的 HCP", {
              repair_hint: "先用 query_hcp 按 name 或 hcp_id 确认编号后重试",
              retryable: false,
            }),
          );
        }
        /** query 组装（§10）：调用方优先，否则 themes 前 3 拼接，姓名学术交流兜底 */
        const callerQuery = args.query?.trim();
        const derivedQuery =
          (twin.research?.themes ?? []).slice(0, 3).map(String).join(" ") ||
          `${twin.identity?.name_zh ?? twin.profile.name_zh} 学术交流`;
        const query = callerQuery || derivedQuery;
        if (!query.trim()) {
          return mcpErrorResult(
            mcpError("VALIDATION_ERROR", "无法组装检索词", {
              repair_hint: "补充 query 或先完成分身研究主题刷新后重试",
              retryable: false,
            }),
          );
        }
        const specialty =
          args.specialty?.trim() || twin.profile.specialties?.[0] || undefined;
        const result = await runRetrieveAcademic({
          query,
          specialty,
          themes: args.themes,
        });
        /** ADR-014：coverage 信号透出；sparse 建议补种（不写库、不内联补种） */
        const coverage = result.coverage;
        const sparse = coverage?.status === "sparse";
        return textResult({
          chunks: result.chunks,
          ...(coverage ? { coverage } : {}),
          ...(sparse
            ? {
                repair_hint:
                  "知识库该专科覆盖不足，建议补种后重试（Web 确认保存或 MCP2-08 ingest_academic）",
              }
            : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({
            event: "retrieve_academic_failed",
            hcp_id: args.hcp_id,
            message,
          }),
        );
        return mcpErrorResult(
          mcpError("INTERNAL_ERROR", "retrieve_academic 检索失败", {
            repair_hint: "检查知识库连通性（Qdrant 与嵌入服务）后重试",
            retryable: true,
          }),
        );
      }
    },
  );

  return server;
}

/** 空模板 insights：无 insights 记录或 pending 降级时返回，不编造事实 */
function emptyInsightsTemplate(
  twin: VirtualTwin,
  doingNow?: HcpInsights["doing_now"],
): HcpInsights {
  return {
    hcp_id: twin.meta.hcp_id,
    as_of: twin.meta.as_of,
    doing_now: doingNow,
    interest_directions: [],
    opportunities: [],
    evidence: [],
  };
}

function repairHintFor(
  reason: Extract<EnsureDoingNowResult, { status: "pending" }>["reason"],
): string {
  if (reason === "twin_missing") {
    return "该 HCP 尚无公开分身：等待对内 TWIN2-01 定时刷新完成后重试";
  }
  if (reason === "insufficient_facts") {
    return "公开事实不足：等待 TWIN2-01 刷新，或经 Web 编辑补充专长、研究主题、兴趣与机会后再试";
  }
  return "LLM 暂不可用（无 Key 或调用失败）：检查 LLM_API_KEY / DASHSCOPE_API_KEY 配置后重试";
}