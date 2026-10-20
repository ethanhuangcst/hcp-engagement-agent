# 对外 MCP 2.0 测试说明

> as_of：2026-10-20（新增 §8 feature-02 list_hcp 检查；新增 §9 feature-03 add_hcp 检查，含写前查重 ADR-009；OGT-1 增补：§6 库外检索与令牌缓存、§9 改为候选令牌入参，ADR-010；医院/科室过滤包含匹配，ADR-011；ADR-012 数据面口径：§3 Sprint 门禁 2/3 改 `retrieve_academic` / `retrieve_compliance`）  
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
| 2 | `get_hcp_insights`、`retrieve_academic` 契约 + medical-kb 集成（无 LLM，ADR-012） |
| 3 | `retrieve_compliance` 契约：条款引用返回、`tenant_id` 非入参、description 非预审声明 |

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

§6 增补（OGT-1，ADR-010）：`include_external` 库外候选检索与候选令牌。对应 [mcp2-stories.md](./mcp2-stories.md) US-MCP2-004 新增场景、[mcp2-design.md](./mcp2-design.md) §6 增补。

| 层 | 用例 | 通过 | 失败或空 |
| --- | --- | --- | --- |
| 单元（令牌缓存） | Vitest，令牌缓存模块纯测试（进程内 LRU，fake timer 控制过期） | 签发后按 `candidate_id` 取回候选 payload；TTL 默认 30 分钟内有效；作废后取不回 | 时间越过 TTL → 取不回；同一候选重复签发获得新令牌 |
| 契约 | Vitest + MCP `Client` / `InMemoryTransport`，注入 `ResolveIdentityFn` 与令牌缓存 | `include_external: true` 且注入 resolve 返回候选 → 返回 `external` 块，每条含 `candidate_id` 并已签发令牌；`openWorldHint` 为 true；与库内同人去重（注入库内命中时不重复出现） | 注入 resolve 抛错 → 结果非错误，`external.count` 为 0 并附降级提示；未传 `include_external`、或缺 `hospital` / `department` 时 resolve 注入项从未被调用 |

§6 增补（ADR-011）：医院 / 科室过滤包含匹配。对应 [mcp2-design.md](./mcp2-design.md) §6 可选过滤、[mcp2-stories.md](./mcp2-stories.md) US-MCP2-004 新增场景。规则断言只放 `@hca/db` 纯函数单测，契约层不复制。

| 层 | 用例 | 通过 | 失败或空 |
| --- | --- | --- | --- |
| 单元 | Vitest，`packages/db` `filtersMatch` 纯函数用例 | 医院归一相等与包含命中（`协和医院` 对 `北京协和医院`、`中山医院` 对 `复旦大学附属中山医院`）；科室包含命中（`外科` 对 `肝胆外科`） | 「医院」「协和」短于 3 字符不触发包含；单字「科」不命中；`city` `武汉市` 对 `武汉` 不命中 |

命令：

```bash
npm run test -w @hca/db
npm run test -w @hca/hcp-engagement-mcp
```

可选：本地进程已监听 `MCP2_PORT` 时，用真实 MCP Client 对 `http://localhost:3300/mcp` 调一次 `query_hcp`（不进默认 CI）。

## 7. DEF-001 @hca/db MySQL 对齐

见 [db-tests.md](../db/db-tests.md)。`@hca/db` 运行时已切 `mysql2`。issue 仍 Open。本地 opt-in 烟测：`query_hcp` 对已保存的韩雅玲，`name` 为「韩雅玲」与 `yalin han` 都应 `count` 大于等于 1。不进默认 CI。

## 8. feature-02 `list_hcp` 检查

对应 [mcp2-stories.md](./mcp2-stories.md) US-MCP2-005、[mcp2-design.md](./mcp2-design.md) §7。金字塔约 70 / 20 / 10；本工具无浏览器层。

| 层 | 工具 | 文件 | 通过 | 失败或空 |
| --- | --- | --- | --- | --- |
| 单元（库层职责） | Vitest | `packages/db` 既有 `twins.test.ts` | `listTwins` 排除 `_agent_general`；返回字段为 `TwinListItem` 摘要 | 空库返回空数组；`AGENT_GENERAL_HCP_ID` 不出现 |
| 契约 | Vitest + MCP `Client` / `InMemoryTransport` | `packages/hcp-engagement-mcp/src/server.test.ts` | `callTool` `list_hcp` 返回 `count` 与 `items` 且等长；`readOnlyHint` 为 true；注入 `listTwins` 返回多条时逐条含 `hcp_id` | 注入 `listTwins` 抛错 → `INTERNAL_ERROR` 且正文无 `stack`、无连接串；注入返回空数组 → `count` 为 0 且非错误响应 |
| 集成（可选） | 真实 MCP Client | 本地 `http://localhost:3300/mcp` | 对已迁移库调 `list_hcp`，`count` 与 Web 列表「共 N 位HCP」一致 | 不进默认 CI |

分层说明：
- 排除占位与摘要字段的**行为断言只放 `@hca/db` 单测**；契约层不复制库行为，只验证 handler 的返回形状、annotations 与错误映射（与 feature-01 §6 同一职责划分）。
- handler 通过注入 `listTwins` 测试，无需真实 MySQL；默认 CI 零外网、零生产库。

命令：

```bash
npm run test -w @hca/db
npm run test -w @hca/hcp-engagement-mcp
```

## 9. feature-03 `add_hcp` 检查

对应 [mcp2-stories.md](./mcp2-stories.md) US-MCP2-006、[mcp2-design.md](./mcp2-design.md) §8。金字塔约 70 / 20 / 10；本工具无浏览器层。

| 层 | 工具 | 文件 | 通过 | 失败或空 |
| --- | --- | --- | --- | --- |
| 单元（库层职责） | Vitest | `packages/db` 新增 `confirm.test.ts`（mock pool，与 `twins.test.ts` 同方式） | `confirmAndSaveTwin` 构造的 identity twin 字段齐全（`twin_version` 1、`disambiguation_status` `ambiguous`、`as_of` 当天）；`specialties` / `themes` 落 `profile` / `research`；`hcp_tier` 缺省 `T2`、`role_tags` 缺省空数组；ADR-004：候选载荷文献号落 `openalex` 主 ID + `openalex_aliases`（去重且不含主 ID）、镜像进 `profile.external_ids`；写路径为 `upsertTwin` + `upsertInsights`（空模板） | 编号已存在 → `VALIDATION_ERROR` 且不再调用 `upsertTwin`；身份字段缺失（服务层防御）→ `VALIDATION_ERROR`；`hcp_id` 为 `_agent_general` → `VALIDATION_ERROR`；同名命中 → `confirmation_required` 且未调用 `upsertTwin`；`confirm_not_duplicate: true` → 写入成功；`name_en` 拉丁档命中同样拦截；医院归一相同者排 `possibleDuplicates` 首位 |
| 契约 | Vitest + MCP `Client` / `InMemoryTransport` | `packages/hcp-engagement-mcp/src/server.test.ts` | `add_hcp` schema 必填集合为 `candidate_id`（与 product-backlog 一致）、可选 `confirm_not_duplicate`；不再有 `hcp_id` / `name_zh` / `author_ids_draft` / `tags_draft` 入参（task-01 stub 同步改形状）；`readOnlyHint` 为 false；令牌缓存含有效候选 → handler 组装身份入参调注入 `AddHcpFn`，返回 `{ twin, hcp_id }` 且无 `knowledge_jobs` 键；注入返回 `confirmation_required` 时工具结果为非错误且透传 `possible_duplicates`；带 `confirm_not_duplicate` 调用时参数透传；成功后替换原 stub 测试 | 缺 `candidate_id` → 工具失败（SDK schema 层拦截，无 mcpError 信封）；令牌不存在 / 过期 / 已作废 → `NOT_FOUND` 且库中未新增；成功后同一 `candidate_id` 再调 → `NOT_FOUND`；注入「已存在」错误 → `VALIDATION_ERROR`；注入抛错 → `INTERNAL_ERROR` 且正文无 `stack`、无连接串 |
| 集成（可选） | 真实 MCP Client | 本地 `http://localhost:3300/mcp` | 真旅程：`query_hcp` 带 `include_external: true` 检出库外候选 → 人选认一个 `candidate_id` → `add_hcp` 写入；`list_hcp` 的 `count` 加 1、`query_hcp` 按新 `hcp_id` 命中；同一 `candidate_id` 再调返回 `NOT_FOUND`；验证后删除该测试记录 | 不进默认 CI；禁止对生产 `DATABASE_URL` 跑本项；对内 `hcp-twin-mcp` 不在线时验证降级路径 |

分层说明：
- 身份构造、查重、ADR-004 文献号校验的**行为断言只放 `@hca/db` 单测**；契约层只验证 handler 的入参 schema、令牌门、返回形状、annotations 与错误映射（与 §6 / §8 同一职责划分）。
- handler 通过注入 `AddHcpFn` 测试，无需真实 MySQL；默认 CI 零外网、零生产库。

命令：

```bash
npm run test -w @hca/db
npm run test -w @hca/hcp-engagement-mcp
```
