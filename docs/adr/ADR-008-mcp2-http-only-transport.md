# ADR-008: 对外 MCP 2.0 仅提供 Streamable HTTP 传输

## 状态
已采纳

## 背景
对外 MCP 2.0（`@hca/hcp-engagement-mcp`）原设计支持 stdio 与 Streamable HTTP 双传输（`MCP2_TRANSPORT` 切换）。本地 Cursor 接入曾按 stdio 子进程方式配置（`.cursor/mcp.json` + `node dist/cli.js`）。Ethan 决策：**不允许使用 stdio，只能使用 HTTP(S)**。stdio 子进程方式使客户端承担进程托管与产物重建职责（改代码后需重新 build 再 reload），进程生命周期不可观测；HTTP 方式与生产部署形态（release.md §6.1，容器端口 3300）完全一致，本地与线上走同一协议路径。

## 决策
1. **客户端接入仅 Streamable HTTP**：Cursor 及其他宿主通过 `url: http://localhost:3300/mcp` 连接；`.cursor/mcp.json` 移除 stdio 条目。
2. **服务端暴露形态仅 HTTP**：产品路径为 Streamable HTTP，`MCP2_PORT`（缺省 3300），`GET /health` 健康检查；stdio 分支（`MCP2_TRANSPORT=stdio`）随本变更一并从代码与 env 模板中移除。
3. **本地托管**：开发期由开发者手动 `npm run dev:hcp-engagement-mcp` 启动；常驻托管（launchd / make up 约定）属后续独立需求，不在本 ADR 范围。
4. **本机为 http 非 https**：回环链路不引入 TLS 反代；对外提供 HTTPS 时走部署层（NPM Host / agent-mate.ai 域名），见 release.md §6.1。
5. **鉴权维持 2.0 既定决策**：不做鉴权，仅本机/内网可达。（2026-10-22 修订：公网入口 `hcp-mcp.agent-mate.ai` 经部署层反代开放，仍不做鉴权，可达范围从本机/内网扩至公网；见 [release.md §6.1](../../specs/release.md) 与 [DEF-011](../../specs/issues-log.md)。）

## 原因
- 本地与生产同一传输路径，客户端配置零差异，降低联调与文档成本。
- Cursor 不再拉起子进程，避免 `dist/` 产物陈旧导致的行为不一致。
- stdio 在 MCP 2.0 场景无不可替代收益：调用方全部是远程形态的宿主 Agent。

## 后果
- 使用 MCP 前必须保证服务进程在跑；进程不在时客户端报连接失败，属预期。
- `MCP2_TRANSPORT` 环境变量随 stdio 分支移除而失效，`.env.example`、文档与 `.cursor/mcp.json` 同步清理。
- mcp2-design.md §2、mcp2-stories.md、mcp2-test.md、architecture.md、release.md 中 stdio 相关表述按本 ADR 修订。

## 日期
2026-10-19
