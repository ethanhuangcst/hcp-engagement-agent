# 对外 MCP 2.0 设计

> as_of：2026-10-19  
> 需求与工具契约：[product-backlog.md](../product-backlog.md#external-service)  
> 对内采集 MCP：[mcp-design.md](../mcp/mcp-design.md) · [mcp-function-spec.md](../mcp/mcp-function-spec.md)  
> 架构：[3.architecture.md](../spec1.0/3.architecture.md)

## 1. 边界

```text
调用方（Cursor / 企业 Agent）
        │  MCP 2.0（本设计）
        ▼
  @hca/db · @hca/hcp-engagement-agent · @hca/medical-kb
        │
        ✕ 不暴露 hcp-twin-mcp（resolve / build / collectors）
```

- Twin 内容刷新：后台 TWIN2-01，无对外「构建」工具。
- 工具名、入参、返回、Annotations：以 product-backlog「MCP」list 为准。

## 2. 进程与包（目标形态）

| 项 | 说明 |
| --- | --- |
| 包名（建议） | `@hca/hcp-engagement-mcp` 或 `packages/hcp-engagement-mcp` |
| Transport | Sprint 1 `task-01` 定 stdio 和/或 Streamable HTTP；日志走 stderr |
| 注册 | 六工具分三 sprint 落地；handler 调共享库，不复制 BFF 路由逻辑 |
| 配置 | `DATABASE_URL`、LLM/RAG 与 Web 同源 env；密钥仅进程环境 |

## 3. 工具 → 依赖映射

| 工具 | 读/写 | 主要依赖 |
| --- | --- | --- |
| `list_hcp` | 读 | `@hca/db` `listTwins` |
| `query_hcp` | 读 | `@hca/db` 过滤 / `getTwin` |
| `add_hcp` | 写 | 确认保存路径（对齐 `/api/twins/confirm`，不自动 build） |
| `get_hcp_insights` | 读 | `@hca/db` insights + twin |
| `propose_engagement_options` | 写 | `@hca/hcp-engagement-agent` `proposeOptions` |
| `precheck_compliance` | 写 | `@hca/hcp-engagement-agent` `runComplianceGate` |

## 4. 错误与观测

- 统一 `{ code, message, repair_hint? }`；与 BFF 错误码对齐。
- 健康：可选 `health` tool 或独立 HTTP `/health`（Streamable HTTP 时）。
- 指标（后续）：每 tool 延迟、LLM 调用次数、失败码计数。

## 5. 实现顺序

见 [sprint-backlog.md](../sprint-backlog.md) Sprint 1–3。
