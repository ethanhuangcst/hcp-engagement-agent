# 对外 MCP 2.0 测试说明

> as_of：2026-10-21（新增 §8 feature-02 list_hcp 检查；新增 §9 feature-03 add_hcp 检查，含写前查重 ADR-009；OGT-1 增补：§6 库外检索与令牌缓存、§9 改为候选令牌入参，ADR-010；医院/科室过滤包含匹配，ADR-011；ADR-012 数据面口径：§3 Sprint 门禁 2/3 改 `retrieve_academic` / `retrieve_compliance`；2026-10-20 ADR-013 + Sprint 3 并入：§3 门禁合并为 Sprint 2、§9 增异步刷新触发检查；2026-10-21 新增 §10 feature-01 get_hcp_insights 检查；新增 §11 feature-02 retrieve_academic 检查与 §12 feature-04 retrieve_compliance 检查；补记 §13 feature-07 知识覆盖对齐检查，ADR-014；新增 §14 feature-11 科室来源标注与预灌映射预览检查，MCP2-09 / DEF-005）  
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
| 2 | `get_hcp_insights` 契约（含按需合成、降级、幂等回填，ADR-013）+ `retrieve_academic` 契约 + medical-kb 集成（无 LLM，ADR-012）+ `retrieve_compliance` 契约（条款引用返回、`tenant_id` 非入参、description 非预审声明）+ TWIN2-01 调度器单测（[../mcp/mcp-tests.md](../mcp/mcp-tests.md)；ADR-013）。原 Sprint 3 已并入本行 |

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

§9 增补（ADR-013）：`add_hcp` 异步刷新触发。对应 [mcp2-design.md](./mcp2-design.md) §8 增补、[mcp2-stories.md](./mcp2-stories.md) US-MCP2-006 新增场景；调度器与 `ensureDoingNow` 行为断言在 [../mcp/mcp-tests.md](../mcp/mcp-tests.md)，本层不复制。

| 层 | 用例 | 通过 | 失败或空 |
| --- | --- | --- | --- |
| 契约 | Vitest + MCP `Client` / `InMemoryTransport`，注入 `AddHcpFn` 与 build 触发件 | 写入成功 → 返回含 `refresh.run_id`；fire-and-forget 不阻塞（响应先于触发完成） | 注入触发抛错 / activeRun 冲突 → 返回仍成功且记录已写入；`confirmation_required` 分支不触发、无 `refresh` 键 |

## 10. feature-01 `get_hcp_insights` 检查（Sprint 2）

对应 [mcp2-stories.md](./mcp2-stories.md) US-MCP2-002、[mcp2-design.md](./mcp2-design.md) §9、[ADR-013](../../docs/adr/ADR-013-insight-synthesis-triggers.md)。金字塔约 70 / 20 / 10；本工具无浏览器层。

行为断言归属：幂等复用、in-flight 去重、事实不足 / 无 Key / LLM 失败降级已在 agent 包 `ensure-doing-now.test.ts`（9 用例）与 `synthesize` 的 `hasEnoughFacts` 覆盖，本层不复制；契约层只测 handler 的入参、返回形状、annotations 与错误映射。

| 层 | 用例 | 通过 | 失败或空 |
| --- | --- | --- | --- |
| 契约 | Vitest + MCP `Client` / `InMemoryTransport`，注入 `GetTwinFn` / `GetInsightsFn` / `EnsureDoingNowFn` | `hcp_id` 必填 schema 与 product-backlog 一致；纯读：注入 insights 含 `doing_now` → 返回 `{ twin, insights }` 且 `Ensure` 注入项从未被调用、`insights` 顶层无 `synthesized` 键；合成：注入空模板 + `Ensure` 返回 `ready` → `insights` 顶层 `synthesized: true`；`Ensure` 返回 `pending`（`insufficient_facts` / `llm_unavailable`）→ `insights` 顶层 `pending: true` 且 `repair_hint` 出现、非错误响应；`readOnlyHint` 为 false | 注入 `getTwin` 返回 null 或 `_agent_general` → `NOT_FOUND`；缺 `hcp_id` → SDK schema 层拦截、无 mcpError 信封；注入库函数抛错 → `INTERNAL_ERROR` 且正文无 `stack`、无连接串 |
| 集成（可选） | 真实 MCP Client，本地 `http://localhost:3300/mcp` | 朱同玉 fixture：已有 `doing_now` 纯读返回；清空 `doing_now` 后触发按需合成再读，`synthesized: true` 仅首次出现，第二次为纯读 | 不进默认 CI；禁止对生产 `DATABASE_URL` 跑本项；live LLM 为 opt-in |

命令：

```bash
npm run test -w @hca/hcp-engagement-mcp
npm run test -w @hca/hcp-engagement-agent
```

## 11. feature-02 `retrieve_academic` 检查（Sprint 2）

对应 [mcp2-stories.md](./mcp2-stories.md) US-MCP2-002、[mcp2-design.md](./mcp2-design.md) §10、[ADR-012](../../docs/adr/ADR-012-mcp2-data-plane-only.md)。金字塔约 70 / 20 / 10；本工具无浏览器层。

行为断言归属：向量 + BM25 + RRF 融合、rerank 与过滤已在 `@hca/medical-kb` 测试覆盖；本层只测 handler 契约（入参、query 组装、透传、annotations、错误映射）。

| 层 | 用例 | 通过 | 失败或空 |
| --- | --- | --- | --- |
| 契约 | Vitest + MCP `Client` / `InMemoryTransport`，注入 `GetTwinFn` / `RetrieveAcademicFn` | tools/list 含 `retrieve_academic`，`readOnlyHint: true`、`openWorldHint: true`，`hcp_id` 必填 schema 与 product-backlog 一致；调用方传 `query` / `specialty` / `themes` → 注入项原样收到；只传 `hcp_id` 且注入 twin 含 themes → 注入项收到 themes 组装的 query（与 propose 组装规则一致）；注入返回 chunks → 原样返回。coverage 信号断言见 §13（feature-07 批次） | 注入 `getTwin` 返回 null 或 `_agent_general` → `NOT_FOUND`；缺 `hcp_id` → SDK schema 层拦截、无 mcpError 信封；注入抛 RAG 错误 → `INTERNAL_ERROR` 且 `repair_hint` 指向知识库连通性、正文无 `stack`、无连接串 |
| 集成（可选） | 真实 MCP Client，本地 `http://localhost:3300/mcp` + Qdrant 学术种子 | 朱同玉 fixture 只传 `hcp_id`：themes 组装检索词返回带引用 chunks；再传显式 `query` 复核 | 不进默认 CI；`VECTOR_BACKEND=qdrant-local`；禁止对生产环境跑本项 |

命令：

```bash
npm run test -w @hca/hcp-engagement-mcp
npm run test -w @hca/hcp-engagement-agent
```

## 12. feature-04 `retrieve_compliance` 检查（Sprint 2）

对应 [mcp2-stories.md](./mcp2-stories.md) US-MCP2-003、[mcp2-design.md](./mcp2-design.md) §11、[ADR-012](../../docs/adr/ADR-012-mcp2-data-plane-only.md)。金字塔约 70 / 20 / 10；本工具无浏览器层。

行为断言归属：检索融合与 rerank 同 §11 归 medical-kb；`tenant_id` 缺省仅返回全局种子（`tid == null` 过滤）已在 medical-kb `api.test.ts` 覆盖，本层只断言「不透传」与 schema 无键。

| 层 | 用例 | 通过 | 失败或空 |
| --- | --- | --- | --- |
| 契约 | Vitest + MCP `Client` / `InMemoryTransport`，注入 `GetTwinFn` / `RetrieveComplianceFn` | tools/list 含 `retrieve_compliance`，`readOnlyHint: true`、`openWorldHint: false`；`hcp_id` 必填 schema 且 properties 不含 `tenant_id`、`jurisdiction` 键；description 含「不是预审判定」「不替代正式 MLR」；只传 `hcp_id` → 注入项收到默认合规 query 且未收到 `tenant_id`；调用方传 `query` / `interaction_type` → 原样透传；注入返回 chunks → 原样返回 | 注入 `getTwin` 返回 null 或 `_agent_general` → `NOT_FOUND`；缺 `hcp_id` → SDK schema 层拦截；注入抛 RAG 错误 → `INTERNAL_ERROR` 且正文无 `stack`、无连接串 |
| 集成（可选） | 真实 MCP Client，本地 `http://localhost:3300/mcp` + 合规全局种子 | 朱同玉 fixture 只传 `hcp_id`：返回 chunks 每条含 `clause_id` / `authority` / `version` 且 `tenant_id` 均为空 | 不进默认 CI；禁止对生产环境跑本项 |

命令：

```bash
npm run test -w @hca/hcp-engagement-mcp
npm run test -w @hca/hcp-engagement-agent
```

## 13. feature-07 知识覆盖对齐检查（Sprint 2，ADR-014）

对应 [mcp2-stories.md](./mcp2-stories.md) US-MCP2-006 预灌两场景与 US-MCP2-002 稀疏场景、[mcp2-design.md](./mcp2-design.md) §12、[ADR-014](../../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)。金字塔约 70 / 20 / 10；无浏览器层。

行为断言归属：coverage 判定与灌注 job 生命周期归 medical-kb（`coverageCheck` / `ingestOnDemand` 既有测试）；专科解析 `resolveSpecialtiesForIngest` 提取入包后，其单元测试随迁 medical-kb。本层只测 MCP handler 契约（注入项收到什么、返回体长什么样、失败不串扰）。

| 层 | 用例 | 通过 | 失败或空 |
| --- | --- | --- | --- |
| 契约（add_hcp 预灌） | Vitest + MCP `Client` / `InMemoryTransport`，注入 `AddHcpFn` / `TriggerIngestFn` | 写库成功且候选专科可归一化 → 注入 `triggerIngest` 收到 twin 派生的受控专科集合；返回体可选附 `knowledge_jobs[]`（含 specialty、job_id、knowledge_status） | 注入 `triggerIngest` 抛错 → 工具结果仍为成功、记录已写入、失败只进服务端日志；候选专科无法归一化 → 不触发预灌、不报错、返回无 `knowledge_jobs` 键 |
| 契约（coverage 信号） | 注入 `GetTwinFn` / `RetrieveAcademicFn`（返回签名含 `coverage?`） | 注入返回 `coverage.status: "sparse"` → `structuredContent.coverage.status` 为 `sparse` 且 `repair_hint` 建议补种；注入返回 `ready` → 无补种建议；无专科口径（coverage 省略） → 返回体无 `coverage` 键且检索不报错 | coverage 缺失不阻塞 chunks 返回；`readOnlyHint: true` 注解不变；调用前后库内记录无变化（不触发灌注） |
| 单元（提取回归） | medical-kb：`resolveSpecialtiesForIngest` / `triggerKnowledgeIngest` 随函数从 webapp lib 迁入 | 受控键解析、非受控静默跳过、`INGEST_IN_PROGRESS` 记 pending 三行为与 webapp 版一致 | 输入全非受控 → 空数组、零 job |
| 回归 | webapp 改为从 `@hca/medical-kb` 导入后，`apps/web` typecheck + 既有测试绿 | 确认保存链路行为不变（fire-and-forget 语义保留） | confirm 不因 ingest 失败而失败（既有断言不回退） |
| 集成（可选） | 真实 MCP Client，本地 `:3300` + Qdrant，三受控专科种子 | 朱同玉 `hcp_zhu_tongyu_zs` 主题查询 → `coverage.status: "ready"`；库外主题（如糖尿病）查询 → `sparse` + 补种建议；`add_hcp` 新增带受控专科候选 → `get_ingest_status` 可查到 job | 不进默认 CI；禁止对生产环境跑本项 |

命令：

```bash
npm run test -w @hca/medical-kb
npm run test -w @hca/hcp-engagement-agent
npm run test -w @hca/hcp-engagement-mcp
npm run typecheck -w apps/web 2>/dev/null || npm run typecheck
```

## 14. feature-11 检查（科室来源标注与预灌映射预览，MCP2-09 / DEF-005）

对应 [mcp2-stories.md](./mcp2-stories.md) US-MCP2-007、[mcp2-design.md](./mcp2-design.md) §13、[DEF-005](../issues-log.md)。金字塔约 70 / 20 / 10；无浏览器层（Web 展示归 app 模块故事验收）。

行为断言归属：resolve 候选的来源标注、信号归一化与 mismatch 判定归 `@hca/hcp-twin-mcp`（[mcp-tests §5](../mcp/mcp-tests.md)）；`resolveSpecialtiesForIngest` 明细视图的归一化单元归 `@hca/medical-kb`。本层只测对外 handler 契约（透传、返回体形状、失败不串扰）。

| 层 | 用例 | 通过 | 失败或空 |
| --- | --- | --- | --- |
| 契约（候选透传） | Vitest + MCP `Client` / `InMemoryTransport`，注入库外检索返回带新字段的候选 | `query_hcp` include_external 候选含 `department_provenance` / `department_signal` / `department_mismatch` 三字段；candidate-store 缓存保存新字段 | 注入候选无新字段 → 透传不报错、旧字段照常返回（向后兼容） |
| 契约（映射预览） | 注入 `AddHcpFn` / `TriggerIngestFn`，候选科室可归一化 | `add_hcp` 返回体含 `specialty_preview[]`（input / specialty / matched）；预览与 `knowledge_jobs` 预灌专科同源一致（同一 `resolveSpecialtiesForIngest` 结果） | 候选科室映射不到受控专科 → 该行 `matched: false` 附跳过提示；不触发预灌、`add_hcp` 仍成功返回 |
| 契约（降级） | 注入候选无 `department_signal` | `query_hcp` 与 `add_hcp` 均不报错；确认流程不阻塞 | 无 signal 时无 mismatch 字段（不误报） |
| 集成（live 用例） | 真实 MCP Client，本地 `:3300`；twin-mcp `:3200` live 模式 | 陆林输入「神经科」（归一化 neurology，数据源信号 psychiatry）→ 候选带 mismatch 提示；确认可继续、`specialty_preview` 如实展示映射 | 不进默认 CI；禁止对生产环境跑本项 |

命令：

```bash
npm run test -w @hca/hcp-engagement-mcp
npm run test -w @hca/hcp-twin-mcp
```
