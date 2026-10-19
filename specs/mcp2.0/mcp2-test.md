# 对外 MCP 2.0 测试说明

> as_of：2026-10-19（§6 补逗号、连字符、撇号、行首称谓，以及倒序后的 1 次编辑）  
> 基线：项目 [7.test-strategy.md](../spec1.0/7.test-strategy.md)（common-test-strategy 更严者胜）  
> 故事：[mcp2-stories.md](./mcp2-stories.md)

## 1. 范围

| 层 | 对象 | 说明 |
| --- | --- | --- |
| 单元 | tool handler 入参校验、错误码映射 | 无网络 |
| 集成 | handler → `@hca/db` / Agent（fixture DB、mock LLM） | 默认 CI |
| 契约 | 六 tool 的 JSON Schema 与 product-backlog 一致 | 快照或 schema 测试 |
| E2E（可选） | 真实 MCP Client 经 Streamable HTTP 调 tool | 本地或 nightly |

**非范围**：对内 `hcp-twin-mcp` Playwright 采集；浏览器 E2E（仍走 Web ATDD）。

## 2. 环境与数据

- 测试库或事务隔离 MySQL（ADR-005）；禁止生产 `DATABASE_URL`。
- Fixture HCP：朱同玉或最小 synthetic twin（与 `@hca/db` 测试一致）。
- LLM：CI 使用 mock / rule 路径；live DashScope 为 opt-in job。

## 3. Sprint 门禁

| Sprint | 必绿 |
| --- | --- |
| 1 | `task-01`（已绿）：HTTP 启动 + `GET /health` + url 接入 tools/list 含三工具。`feature-01`：见 §6 |
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

## 6. feature-01 `query_hcp` 检查

金字塔约 70 / 20 / 10。无浏览器层（本工具无界面）。

| 层 | 工具 | 文件 | 通过 | 失败或空 |
| --- | --- | --- | --- | --- |
| 单元 | Vitest | `packages/db` 姓名与过滤纯函数测试 | 中文名、英文名、拼音各命中一条；名在前（`changxi wang` 对拼音 `wangchangxi`）命中；拉丁全名差 1 个字母且长度不少于 6（`yalin han` 对 `Yaling Han`）命中 | 空姓名不匹配；医院过滤排除另一家；短串 `han` 不因模糊命中；编辑距离大于等于 2 不命中 |
| 集成 | Vitest + mysql2 mock（与 `@hca/db` 现有 twin 测试同一方式） | `packages/db` `queryTwins` | `hcp_id` 返回完整 twin；同名两条 `count` 等于 `items` 长度；模糊姓名命中时精确项排在编辑距离项之前 | 未知 `hcp_id` 与 `_agent_general` 视为未找到；无匹配 `count` 为 0 |
| 契约 | Vitest + MCP `Client` / `InMemoryTransport` | `packages/hcp-engagement-mcp/src/server.test.ts` | `callTool` `query_hcp` 返回 `count` 与 `items`，只读 annotation 仍为 true。姓名规则由 `@hca/db` 单测覆盖，本层不复制拼音用例 | 缺参 `VALIDATION_ERROR`；不存在的 `hcp_id` 为 `NOT_FOUND`；正文无 `stack` |

逗号、连字符、撇号、行首称谓、倒序后的 1 次编辑。对应 [mcp2-stories.md](./mcp2-stories.md) US-MCP2-004。行为断言只在 `@hca/db` 纯函数。契约层不复制这些用例。

| 层 | 用例 | 通过 | 失败或空 |
| --- | --- | --- | --- |
| 单元 | 逗号当空格再倒序 | `zhang, wenhong` 对 `Wenhong Zhang` 为词序互换档；全角逗号同一档 | `zhang,` 只有一段，不互换 |
| 单元 | 连字符与撇号在归一时去掉 | `Wen-hong Zhang` 对 `Wenhong Zhang` 为精确档；`O'Brien` 对去掉撇号后的英文名为精确档 | 句点不删：`Y. Han` 不命中 `Yaling Han` |
| 单元 | 行首称谓 | `Dr. Yaling Han`、`Prof. Zhang` 去掉称谓后再比对 | `Yaling Han, MD` 不因称谓规则命中；`Dr.Yaling` 不去掉称谓 |
| 单元 | 倒序后再做编辑距离 | `zhang, wenhon` 对 `Wenhong Zhang` 为编辑距离档 | 倒序后仍相差至少 2 不命中；短串 `han` 仍不模糊 |

命令：

```bash
npm run test -w @hca/db
npm run test -w @hca/hcp-engagement-mcp
```

可选：本地进程已监听 `MCP2_PORT` 时，用真实 MCP Client 对 `http://localhost:3300/mcp` 调一次 `query_hcp`（不进默认 CI）。

## 7. DEF-001 @hca/db MySQL 对齐

见 [db-tests.md](../db/db-tests.md)。`@hca/db` 运行时已切 `mysql2`。issue 仍 Open。本地 opt-in 烟测：`query_hcp` 对已保存的韩雅玲，`name` 为「韩雅玲」与 `yalin han` 都应 `count` 大于等于 1。不进默认 CI。
