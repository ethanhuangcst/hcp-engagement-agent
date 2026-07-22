import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TwinStore } from "./store.js";
import {
  GetInsightsInputSchema,
  GetTwinInputSchema,
  HealthCheckInputSchema,
  ResolveInputSchema,
  TagHcpInputSchema,
  confirmAndSaveTwin,
  getInsightsTool,
  getTwinTool,
  healthCheckTool,
  resolveHcpIdentity,
  tagHcpTool,
} from "./tools.js";
import {
  buildTwinTool,
  getTwinStatusTool,
  pollHeatmapTool,
  resourceSlice,
  retagAfterCareerTool,
} from "./tools-build.js";
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
    version: "0.2.0",
  });

  server.registerTool(
    "resolve_hcp_identity",
    {
      description:
        "消歧 HCP 身份：姓名+医院+科室 → candidates[]（人候选 + evidence）。live 走 OpenAlex 等公开 API；mock 仅 CI。副作用：默认不入库。幂等。",
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
    "build_twin",
    {
      description:
        "对已保存 Twin 触发 Stage A–E 情报构建（live 外网 API，非 fixture）。立即返回 runId；同 hcpId 并发冲突返回 BUILD_IN_PROGRESS。非幂等。何时：确认保存后补齐职业/科研/热力/Insights。",
      inputSchema: {
        hcpId: z.string().min(1),
        mode: z.enum(["full", "incremental"]).optional(),
      },
    },
    async (args) => {
      const result = await buildTwinTool(store, args);
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  server.registerTool(
    "get_twin_status",
    {
      description:
        "查询 build_twin 进度：phase / progress / error。副作用：无。幂等。",
      inputSchema: { runId: z.string().min(1) },
    },
    async (args) => {
      const result = await getTwinStatusTool(store, args);
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  server.registerTool(
    "poll_heatmap",
    {
      description:
        "刷新活动热力水位（CT.gov 等公开源），写 last_polled_at。副作用：写 Twin.activity。限速：外网配额。",
      inputSchema: { hcpId: z.string().min(1) },
    },
    async (args) => {
      const result = await pollHeatmapTool(store, args);
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  server.registerTool(
    "retag_after_career",
    {
      description:
        "职业刷新后按规则重打标；user_override 默认保留。副作用：写 profile.tags。幂等。",
      inputSchema: { hcpId: z.string().min(1) },
    },
    async (args) => {
      const result = await retagAfterCareerTool(store, args);
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  server.registerTool(
    "get_twin",
    {
      description:
        "读取已保存 Twin JSON。副作用：无。幂等。不存在返回 NOT_FOUND。",
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
        "读取 Insights。副作用：无。幂等。不存在返回 NOT_FOUND。",
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
        "规则/用户覆盖写入 profile.tags。副作用：写 Twin。幂等。",
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
    "confirm_and_save_twin",
    {
      description:
        "用户确认候选后写入 Twin + Insights。副作用：写 Postgres。幂等。",
      inputSchema: {
        hcpId: z.string().min(1),
        name_zh: z.string().min(1).optional(),
        name_en: z.string().nullable().optional(),
        hospital: z.string().min(1).optional(),
        department: z.string().min(1).optional(),
        title: z.string().nullable().optional(),
        city: z.string().optional(),
        author_ids_draft: z
          .object({
            orcid: z.string().nullable().optional(),
            pubmed_author: z.string().nullable().optional(),
            openalex: z.string().nullable().optional(),
            openalex_aliases: z.array(z.string()).optional(),
            google_scholar: z.string().nullable().optional(),
            scopus_author_id: z.string().nullable().optional(),
            cnki_scholar: z.string().nullable().optional(),
          })
          .passthrough()
          .optional(),
        openalex_ids: z.array(z.string().min(1)).optional(),
        tags_draft: z
          .object({
            hcp_tier: HcpTierSchema.optional(),
            role_tags: z.array(RoleTagSchema).optional(),
          })
          .optional(),
      },
    },
    async (args) => {
      const result = await confirmAndSaveTwin(store, args);
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  server.registerTool(
    "health_check",
    {
      description:
        "进程存活、存储可达、twin_mode。副作用：无。幂等。",
      inputSchema: {},
    },
    async (args) => {
      const result = await healthCheckTool(store, args ?? {});
      return jsonResult(result.ok ? result.data : { error: result.error });
    },
  );

  const sliceTemplate = (kind: "career" | "research" | "heatmap") =>
    new ResourceTemplate(`twin://{hcpId}/${kind}`, {
      list: undefined,
    });

  for (const kind of ["career", "research", "heatmap"] as const) {
    server.registerResource(
      `twin-${kind}`,
      sliceTemplate(kind),
      {
        description: `Twin ${kind} JSON slice (F-MCP-026)`,
        mimeType: "application/json",
      },
      async (uri, vars) => {
        const hcpId = String(vars.hcpId ?? "");
        const twin = await store.getTwin(hcpId);
        if (!twin) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({
                  error: {
                    code: "NOT_FOUND",
                    message: `未找到 Twin: ${hcpId}`,
                  },
                }),
              },
            ],
          };
        }
        const slice = resourceSlice(twin, kind);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(slice, null, 2),
            },
          ],
        };
      },
    );
  }

  void ResolveInputSchema;
  void GetTwinInputSchema;
  void GetInsightsInputSchema;
  void TagHcpInputSchema;
  void HealthCheckInputSchema;

  return server;
}
