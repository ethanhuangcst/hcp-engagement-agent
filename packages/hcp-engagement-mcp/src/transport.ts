import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createMcpServer } from "./server.js";

export async function startHttp(
  port = Number(process.env.MCP2_PORT ?? 3300),
): Promise<void> {
  /** 每会话独立 McpServer：SDK 禁止同一 Server 二次 connect */
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "hcp-engagement-mcp" }));
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
      const sessionServer = createMcpServer();
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
      console.error(`hcp-engagement-mcp Streamable HTTP :${port}/mcp`);
      resolve();
    });
  });
}
