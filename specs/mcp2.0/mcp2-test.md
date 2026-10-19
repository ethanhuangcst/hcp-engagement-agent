# 对外 MCP 2.0 测试说明

> as_of：2026-10-19  
> 基线：项目 [7.test-strategy.md](../spec1.0/7.test-strategy.md)（common-test-strategy 更严者胜）  
> 故事：[mcp2-stories.md](./mcp2-stories.md)

## 1. 范围

| 层 | 对象 | 说明 |
| --- | --- | --- |
| 单元 | tool handler 入参校验、错误码映射 | 无网络 |
| 集成 | handler → `@hca/db` / Agent（fixture DB、mock LLM） | 默认 CI |
| 契约 | 六 tool 的 JSON Schema 与 product-backlog 一致 | 快照或 schema 测试 |
| E2E（可选） | 真实 MCP Client 子进程 stdio 调 tool | 本地或 nightly |

**非范围**：对内 `hcp-twin-mcp` Playwright 采集；浏览器 E2E（仍走 Web ATDD）。

## 2. 环境与数据

- 测试库或事务隔离 Postgres；禁止生产 `DATABASE_URL`。
- Fixture HCP：朱同玉或最小 synthetic twin（与 `@hca/db` 测试一致）。
- LLM：CI 使用 mock / rule 路径；live DashScope 为 opt-in job。

## 3. Sprint 门禁

| Sprint | 必绿 |
| --- | --- |
| 1 | `task-01`：进程启动 + tools/list 含三工具；三 tool  happy path + `VALIDATION_ERROR` / `NOT_FOUND` 各一例 |
| 2 | `get_hcp_insights`、`propose_engagement_options` 契约 + Agent 集成（mock LLM） |
| 3 | `precheck_compliance` 三种 gate status 至少各覆盖一条断言 |

## 4. 命令（随包落地后更新）

```bash
npm run build
npm run test -w @hca/hcp-engagement-mcp   # 包名以实现为准
```

根目录 `npm test` 应在对外 MCP 包加入 workspace 后包含上述套件。

## 5. 质量清单（摘要）

- 无密钥出现在 tool result 或 stderr 协议流。
- readOnly 工具不写库（Annotations 与集成测试双重验证）。
- 失败响应无 stack、无内网路径。
