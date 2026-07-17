import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createStore } from "./store.js";
import { createMcpServer } from "./server.js";

export function getTwinMode(): "mock" | "live" {
  const m = (process.env.TWIN_MODE ?? "live").toLowerCase();
  return m === "mock" ? "mock" : "live";
}

export async function startStdio(): Promise<void> {
  const store = createStore(getTwinMode());
  const server = createMcpServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function startHttp(port = Number(process.env.MCP_PORT ?? 3200)): Promise<void> {
  const store = createStore(getTwinMode());
  const server = createMcpServer(store);
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
      await server.connect(transport);
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
