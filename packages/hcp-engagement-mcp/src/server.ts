import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { queryTwins as defaultQueryTwins, type QueryTwinsResult } from "@hca/db";
import { mcpError } from "@hca/domain";

/** Sprint 1 注册的对外工具名（task-01 验收口径） */
export const SPRINT1_TOOLS = ["list_hcp", "query_hcp", "add_hcp"] as const;

export type QueryTwinsFn = (
  input: Parameters<typeof defaultQueryTwins>[0],
) => Promise<QueryTwinsResult>;

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

export type CreateMcpServerOptions = {
  /** 测试注入；缺省走 @hca/db queryTwins */
  queryTwins?: QueryTwinsFn;
};

export function createMcpServer(options?: CreateMcpServerOptions): McpServer {
  const runQuery = options?.queryTwins ?? defaultQueryTwins;

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
    async () => stubNotImplemented("list_hcp", "feature-02"),
  );

  server.registerTool(
    "query_hcp",
    {
      description:
        "按 hcp_id 或 name 查询单个 HCP（至少传其一），可用 hospital/department/city 消歧。",
      inputSchema: {
        hcp_id: z.string().optional().describe("HCP 主键 ID"),
        name: z
          .string()
          .optional()
          .describe(
            "HCP 姓名：中文精确；英文/拼音；名在前或「姓, 名」；连字符与撇号忽略；行首 Dr/Prof/MD 忽略；长度≥6 的拉丁全名允许 1 次拼写差异（含倒序之后）",
          ),
        hospital: z.string().optional().describe("医院名，用于同名消歧"),
        department: z.string().optional().describe("科室，用于同名消歧"),
        city: z.string().optional().describe("城市，用于同名消歧"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
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
        const body = { count: result.items.length, items: result.items };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(body) }],
          structuredContent: body,
        };
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
        "新增 HCP 档案（写库、非幂等、不触发 build）。必填 hcp_id/name_zh/hospital/department。",
      inputSchema: {
        hcp_id: z.string().min(1).describe("HCP 主键 ID，调用方生成"),
        name_zh: z.string().min(1).describe("中文姓名"),
        name_en: z.string().optional().describe("英文姓名"),
        hospital: z.string().min(1).describe("所在医院"),
        department: z.string().min(1).describe("科室"),
        title: z.string().optional().describe("职称"),
        city: z.string().optional().describe("城市"),
        specialties: z.array(z.string()).optional().describe("专长标签"),
        themes: z.array(z.string()).optional().describe("关注主题"),
        author_ids_draft: z.array(z.string()).optional().describe("候选作者 ID 草稿"),
        tags_draft: z.array(z.string()).optional().describe("标签草稿"),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async () => stubNotImplemented("add_hcp", "feature-03"),
  );

  return server;
}
