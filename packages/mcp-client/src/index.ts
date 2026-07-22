import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type McpToolResult = {
  ok: boolean;
  data?: unknown;
  error?: unknown;
  raw?: unknown;
};

/** MCP 失败信封是仅含 `error`；BuildStatus 等成功体可能带嵌套 `error` 字段，不能误判。 */
function isMcpErrorEnvelope(payload: Record<string, unknown>): boolean {
  if (payload.error == null) return false;
  if ("phase" in payload || "runId" in payload || "candidates" in payload) {
    return false;
  }
  if ("twin" in payload || "hcpId" in payload || "disambiguation_status" in payload) {
    return false;
  }
  return true;
}

function parseToolPayload(result: {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}): McpToolResult {
  if (result.structuredContent && typeof result.structuredContent === "object") {
    const sc = result.structuredContent as Record<string, unknown>;
    if (isMcpErrorEnvelope(sc)) return { ok: false, error: sc.error, raw: sc };
    return { ok: !result.isError, data: sc, raw: sc };
  }
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) {
    return { ok: false, error: { code: "INTERNAL_ERROR", message: "空 MCP 响应" } };
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (isMcpErrorEnvelope(parsed)) {
      return { ok: false, error: parsed.error, raw: parsed };
    }
    return { ok: !result.isError, data: parsed, raw: parsed };
  } catch {
    return { ok: false, error: { code: "INTERNAL_ERROR", message: text } };
  }
}

export class HcpMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  constructor(private readonly mcpUrl: string) {}

  async connect(): Promise<void> {
    if (this.client) return;
    this.transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl));
    this.client = new Client({ name: "hca-bff", version: "0.1.0" });
    try {
      await this.client.connect(this.transport);
    } catch (err) {
      this.client = null;
      this.transport = null;
      throw err;
    }
  }

  async close(): Promise<void> {
    await this.transport?.close();
    this.client = null;
    this.transport = null;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.connect();
    if (!this.client) {
      return { ok: false, error: { code: "INTERNAL_ERROR", message: "MCP client 未连接" } };
    }
    const result = await this.client.callTool({ name, arguments: args });
    return parseToolPayload(result as {
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: unknown;
      isError?: boolean;
    });
  }

  resolveHcpIdentity(input: {
    name: string;
    hospital: string;
    dept: string;
    city?: string;
  }) {
    return this.callTool("resolve_hcp_identity", input);
  }

  getTwin(hcpId: string) {
    return this.callTool("get_twin", { hcpId });
  }

  getInsights(hcpId: string) {
    return this.callTool("get_insights", { hcpId });
  }

  confirmAndSaveTwin(
    hcpIdOrInput:
      | string
      | {
          hcpId: string;
          name_zh?: string;
          name_en?: string | null;
          hospital?: string;
          department?: string;
          title?: string | null;
          city?: string;
          author_ids_draft?: {
            orcid?: string | null;
            pubmed_author?: string | null;
            openalex?: string | null;
            openalex_aliases?: string[];
            google_scholar?: string | null;
            scopus_author_id?: string | null;
            cnki_scholar?: string | null;
            [key: string]: string | string[] | null | undefined;
          };
          openalex_ids?: string[];
          tags_draft?: { hcp_tier?: string; role_tags?: string[] };
        },
  ) {
    const args =
      typeof hcpIdOrInput === "string"
        ? { hcpId: hcpIdOrInput }
        : hcpIdOrInput;
    return this.callTool("confirm_and_save_twin", args);
  }

  healthCheck() {
    return this.callTool("health_check", {});
  }

  buildTwin(input: { hcpId: string; mode?: "full" | "incremental" }) {
    return this.callTool("build_twin", input);
  }

  getTwinStatus(runId: string) {
    return this.callTool("get_twin_status", { runId });
  }

  pollHeatmap(hcpId: string) {
    return this.callTool("poll_heatmap", { hcpId });
  }
}

export function createMcpClient(url = process.env.MCP_URL ?? "http://127.0.0.1:3200/mcp") {
  return new HcpMcpClient(url);
}
