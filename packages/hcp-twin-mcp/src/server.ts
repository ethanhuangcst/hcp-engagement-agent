import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TwinStore } from "./store.js";
import {
  GetInsightsInputSchema,
  GetTwinInputSchema,
  HealthCheckInputSchema,
  ResolveInputSchema,
  TagHcpInputSchema,
  getInsightsTool,
  getTwinTool,
  healthCheckTool,
  resolveHcpIdentity,
  tagHcpTool,
} from "./tools.js";
import { HcpTierSchema, RoleTagSchema } from "@hca/domain";

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

export function createMcpServer(store: TwinStore): McpServer {
  const server = new McpServer({
    name: "hcp-twin-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "resolve_hcp_identity",
    {
      description:
        "消歧 HCP 身份：姓名+医院+科室 → 候选 URL / AuthorIds 草稿 / tags 草稿。副作用：默认不入库完整 Twin（persisted=false）。幂等。何时调用：用户查询 HCP 时。限速：mock 零外网；live 受源站配额约束。",
      inputSchema: {
        name: z.string().min(1),
        hospital: z.string().min(1),
        dept: z.string().min(1),
        city: z.string().optional(),
      },
    },
    async (args) => {
      const result = await resolveHcpIdentity(store, args);
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  server.registerTool(
    "get_twin",
    {
      description:
        "读取已保存 Twin JSON（含 profile.tags、research.author_ids）。副作用：无。幂等。何时调用：详情页 / Agent 需分身结构时。不存在返回 MCP_ERROR NOT_FOUND。",
      inputSchema: { hcpId: z.string().min(1) },
    },
    async (args) => {
      const result = await getTwinTool(store, args);
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  server.registerTool(
    "get_insights",
    {
      description:
        "读取 Insights（doing_now / interest_directions / opportunities）。副作用：无。幂等。何时调用：洞察 Tab。不存在返回 NOT_FOUND。",
      inputSchema: { hcpId: z.string().min(1) },
    },
    async (args) => {
      const result = await getInsightsTool(store, args);
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  server.registerTool(
    "tag_hcp",
    {
      description:
        "规则/用户覆盖写入 profile.tags（hcp_tier + role_tags）。副作用：写 Twin。幂等（同入参结果稳定）。user_override 默认不被规则静默覆盖，除非 force_rule=true。禁止处方潜力等信号。",
      inputSchema: {
        hcpId: z.string().min(1),
        force_rule: z.boolean().optional(),
        override: z
          .object({
            hcp_tier: HcpTierSchema.optional(),
            role_tags: z.array(RoleTagSchema).optional(),
          })
          .optional(),
      },
    },
    async (args) => {
      const result = await tagHcpTool(store, args);
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  server.registerTool(
    "health_check",
    {
      description:
        "进程存活、存储可达、twin_mode、Playwright 状态。副作用：无。幂等。供 BFF GET /api/health。",
      inputSchema: {},
    },
    async (args) => {
      const result = await healthCheckTool(store, args ?? {});
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  // Keep schemas referenced for contract tests / tree-shaking clarity
  void ResolveInputSchema;
  void GetTwinInputSchema;
  void GetInsightsInputSchema;
  void TagHcpInputSchema;
  void HealthCheckInputSchema;

  return server;
}
