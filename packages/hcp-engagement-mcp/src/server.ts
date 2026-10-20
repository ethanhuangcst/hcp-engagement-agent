import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  confirmAndSaveTwin as defaultConfirmAndSave,
  listTwins as defaultListTwinsFn,
  nameMatches,
  queryTwins as defaultQueryTwinsFn,
  type ConfirmAndSaveInput,
  type ConfirmAndSaveResult,
  type QueryTwinsResult,
  type QueryTwinsInput,
  type TwinListItem,
} from "@hca/db";
import { createMcpClient } from "@hca/mcp-client";
import { mcpError, type VirtualTwin } from "@hca/domain";
import {
  CandidateStore,
  type CandidatePayload,
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
  /** 测试注入；缺省进程内新建（ADR-010 令牌缓存） */
  candidateStore?: CandidateStore;
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
  };
}

export function createMcpServer(options?: CreateMcpServerOptions): McpServer {
  const runQuery = options?.queryTwins ?? defaultQueryTwinsFn;
  const runList = options?.listTwins ?? defaultListTwinsFn;
  const runResolve = options?.resolveIdentity ?? defaultResolveIdentity;
  const runAdd = options?.addHcp ?? defaultConfirmAndSave;
  const tokens = options?.candidateStore ?? new CandidateStore();

  const server = new McpServer(
    { name: "hcp-engagement-mcp", version: "0.1.0" },
    { instructions: "HCP engagement 对外 MCP 2.0。Sprint 1 提供三工具注册骨架。" },
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
        "新增 HCP 档案（写库、非幂等、不触发 build）。仅接受 query_hcp 检出、经人选认的库外候选：传 candidate_id（必填，约 30 分钟有效，写入成功即作废）；可选 confirm_not_duplicate 确认疑似同人确非重复。身份字段由候选载荷生成，不接受直传。",
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
        return textResult({ twin: result.twin, hcp_id: result.hcp_id });
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

  return server;
}