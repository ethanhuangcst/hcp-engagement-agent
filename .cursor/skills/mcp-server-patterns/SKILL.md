---
name: mcp-server-patterns
description: |
  Build MCP servers with Node/TypeScript SDK — tools, resources, prompts, Zod
  validation, stdio vs Streamable HTTP. Use when implementing hcp-twin-mcp,
  adding MCP tools/resources, choosing transport, or debugging MCP in this repo.
  Keywords: MCP, modelcontextprotocol, hcp-twin-mcp, Playwright, stdio, Streamable HTTP.
---

# MCP Server Patterns

The Model Context Protocol (MCP) lets AI assistants call tools, read resources, and use prompts from your server. Use this skill when building or maintaining MCP servers. The SDK API evolves; check Context7 (query-docs for "MCP") or the official MCP documentation for current method names and signatures.

## When to Use

Use when: implementing a new MCP server, adding tools or resources, choosing stdio vs HTTP, upgrading the SDK, or debugging MCP registration and transport issues.

## How It Works

### Core concepts

- **Tools**: Actions the model can invoke (e.g. search, run a command). Register with `registerTool()` or `tool()` depending on SDK version.
- **Resources**: Read-only data the model can fetch (e.g. file contents, API responses). Register with `registerResource()` or `resource()`. Handlers typically receive a `uri` argument.
- **Prompts**: Reusable, parameterised prompt templates the client can surface (e.g. in Claude Desktop). Register with `registerPrompt()` or equivalent.
- **Transport**: stdio for local clients (e.g. Claude Desktop); Streamable HTTP is preferred for remote (Cursor, cloud). Legacy HTTP/SSE is for backward compatibility.

The Node/TypeScript SDK may expose `tool()` / `resource()` or `registerTool()` / `registerResource()`; the official SDK has changed over time. Always verify against the current [MCP docs](https://modelcontextprotocol.io) or Context7.

### Connecting with stdio

For local clients, create a stdio transport and pass it to your server's connect method. The exact API varies by SDK version (e.g. constructor vs factory). See the official MCP documentation or query Context7 for "MCP stdio server" for the current pattern.

Keep server logic (tools + resources) independent of transport so you can plug in stdio or HTTP in the entrypoint.

### Remote (Streamable HTTP)

For Cursor, cloud, or other remote clients, use **Streamable HTTP** (single MCP HTTP endpoint per current spec). Support legacy HTTP/SSE only when backward compatibility is required.

## Examples

### Install and server setup

```bash
npm install @modelcontextprotocol/sdk zod
```

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({ name: "my-server", version: "1.0.0" });
```

Register tools and resources using the API your SDK version provides: some versions use `server.tool(name, description, schema, handler)` (positional args), others use `server.tool({ name, description, inputSchema }, handler)` or `registerTool()`. Same for resources — include a `uri` in the handler when the API provides it. Check the official MCP docs or Context7 for the current `@modelcontextprotocol/sdk` signatures to avoid copy-paste errors.

Use **Zod** (or the SDK's preferred schema format) for input validation.

## Best Practices

- **Schema first**: Define input schemas for every tool; document parameters and return shape.
- **Errors**: Return structured errors or messages the model can interpret; avoid raw stack traces.
- **Idempotency**: Prefer idempotent tools where possible so retries are safe.
- **Rate and cost**: For tools that call external APIs, consider rate limits and cost; document in the tool description.
- **Versioning**: Pin SDK version in package.json; check release notes when upgrading.

## Official SDKs and Docs

- **JavaScript/TypeScript**: `@modelcontextprotocol/sdk` (npm). Use Context7 with library name "MCP" for current registration and transport patterns.
- **Go**: Official Go SDK on GitHub (`modelcontextprotocol/go-sdk`).
- **C#**: Official C# SDK for .NET.

---

## 本项目：hcp-twin-mcp（必读锚点）

| 文档 | 内容 |
|------|------|
| `specs/3.architecture.md` §5.2 | Twin MCP 职责、进程边界 |
| `specs/4.install-dependencies.md` §0、§5 | Tools、环境变量、端口 `:3200` |
| `knowledge/mcp-hcp-virtual-twin/data-sources-zhu-tongyu.md` | Collector 与数据源 |
| `specs/5.hcp-twin-data-dictionary.md` | Twin JSON 字段契约 |

### 硬规则

| 规则 | 原因 |
|------|------|
| **Playwright 仅在本 MCP 进程** | `apps/web` 禁止依赖 playwright |
| 输出写香港 Postgres | 与 BFF、Agent 共用 `DATABASE_URL` |
| 浏览器只调 BFF；BFF 用 `mcp-client` | 安全与 Key 隔离 |
| `TWIN_MODE=mock` 仅 CI；产品验收用 `live` | 见 stack §5.4 |

### P0 Tools（schema 先行）

| Tool | 幂等 | 说明 |
|------|------|------|
| `resolve_hcp_identity` | 是 | name + hospital + dept → hcpId；尽量回填 `external_ids` / `author_ids`；写入 `profile.tags`（`hcp_tier` + `role_tags`，见 `knowledge/hcp-twin/hcp-tagging.md`） |
| `build_twin` | 否 | 返回 `runId`；异步 collector；Stage C 前须满足 §3.2.1（≥1 个 P0 文献号） |
| `get_twin_status` | 是 | phase / progress |
| `get_twin` / `get_insights` | 是 | 读 Postgres |
| `tag_hcp` | 是 | 可选：按公开证据重算级别标签（规则优先） |

**AuthorIds（论文检索 · 活跃）**：`orcid` · `pubmed_author` · `openalex`（P0）；Europe PMC / Crossref（P1）；试验登记旁证（P2）。须公开 API、国内可访问、免登录、无爬虫。见 `literature-sources.md` 与数据字典 §3.2。

**Tags（级别打标）**：主标 `hcp_tier`（T1/T2/T3/unclassified）+ 辅标 `role_tags[]`；禁止处方潜力打标。见数据字典 §3.5。

### P1 Resources（可选）

```text
twin://{hcpId}/career
twin://{hcpId}/research
twin://{hcpId}/heatmap
```

### 传输

| 环境 | 传输 |
|------|------|
| 本地 / Cursor 调试 | `stdio` |
| 生产 + Web BFF | **Streamable HTTP** `:3200` |

### 合规（Twin 采集）

- 仅公开信息；不爬处方/统方/非公开 CRM
- 活动热力不得用拜访记录冒充公开 `events`
- 见 `cn-hcp-compliance` + `specs/5.hcp-twin-data-dictionary.md` §1.4
