import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createStore } from "./store.js";
import { createMcpServer } from "./server.js";

/**
 * 产品路径默认 live。mock 仅允许 CI / 显式放行：
 * - Vitest 设置 `VITEST=true`
 * - 或 `ALLOW_TWIN_MOCK=1`
 * 裸 `TWIN_MODE=mock` 在产品进程中会被拒绝并回落 live（打 stderr 警告）。
 */
export function getTwinMode(): "mock" | "live" {
  const m = (process.env.TWIN_MODE ?? "live").toLowerCase();
  if (m !== "mock") return "live";
  const allow =
    process.env.VITEST === "true" ||
    process.env.ALLOW_TWIN_MOCK === "1" ||
    process.env.ALLOW_TWIN_MOCK === "true";
  if (!allow) {
    console.error(
      "[hcp-twin-mcp] TWIN_MODE=mock 被忽略：产品路径强制 live。CI 请设 VITEST 或 ALLOW_TWIN_MOCK=1",
    );
    return "live";
  }
  return "mock";
}

export async function startStdio(): Promise<void> {
  const store = createStore(getTwinMode());
  const server = createMcpServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function startHttp(port = Number(process.env.MCP_PORT ?? 3200)): Promise<void> {
  const store = createStore(getTwinMode());
  /** 每会话独立 McpServer：SDK 禁止同一 Server 二次 connect */
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "hcp-twin-mcp", twin_mode: store.mode }));
      return;
    }

    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (req.method === "POST" && !transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        const id = transport!.sessionId;
        if (id) transports.delete(id);
      };
      const sessionServer = createMcpServer(store);
      await sessionServer.connect(transport);
    }

    if (!transport) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing or invalid MCP session" }));
      return;
    }

    await transport.handleRequest(req, res);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      console.error(
        `hcp-twin-mcp Streamable HTTP :${port}/mcp twin_mode=${getTwinMode()}`,
      );
      resolve();
    });
  });
}
