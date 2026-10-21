# 变更记录（HCP Engagement Assistant）

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-21
> [Definition](../.cursor/templates/framework.sdd.works/sdd-scrum-practices.md#changes-logmd)

---

## 2026-10-21

### feature-01 Done：get_hcp_insights 对外工具（MCP2-03）

**原因**：Sprint 2 需集成方经对外 MCP 读取 HCP 洞察；ADR-013 的按需合成入口已在 feature-05 落地，本故事完成 MCP 接线与契约验收。

**变更内容**：
- `@hca/hcp-engagement-mcp`：注册 `get_hcp_insights`（`hcp_id` 必填、`readOnlyHint: false`）；注入 `GetTwinFn` / `GetInsightsFn` / `EnsureDoingNowFn`；处理流按 §9（预检 → 纯读 → 按需合成 / pending）；workspace 依赖 `@hca/hcp-engagement-agent`。
- 契约测试 9 例（纯读、合成 `synthesized: true`、pending 两原因、null insights、`NOT_FOUND`、`_agent_general`、INTERNAL_ERROR 无泄漏、annotations）。
- 规格：`mcp2-design.md` §9、`mcp2-stories.md` US-MCP2-002、`mcp2-test.md` §10（开工准备批次）。

**验收**：engagement-mcp 42/42、agent 27/27；typecheck / build 绿；本地 `:3300` 对朱同玉两条实调纯读成功；用户 close confirm feature-01 可用。

---

## 2026-10-20

### OGT-1 Done：单一 `.env.local` 与 `loadRootEnv` 收敛

**原因**：env 加载逻辑在 6 处复制且口径不一（部分只读 `.env`）；仓库根只有 `.env.local` 时这些入口静默跳过 env，live 测试与 CLI 依赖手工 source。

**变更内容**：
- `@hca/db`：`index.ts` 导出 `loadRootEnv`（唯一实现，`.env` 后 `.env.local` 覆盖）。
- 删除五处 CLI 复制改引共享实现：twin-mcp / engagement-mcp cli、medical-kb 两个 seed cli、agent `synthesize-zhu`（后三处原只读 `.env`，属隐性故障一并修复）。
- 删除三处测试 `loadEnv` 复制（medical-kb `api.test.ts`、agent `api.test.ts` / `engagement.test.ts`，原同样只读 `.env`），改 `loadRootEnv()` 并保留 `chdir`。
- `.env.example` 首行注释改 `Copy to .env.local`（用户确认 diff，仅此一行）。
- `spec1.0/4.install-dependencies.md`：§0.2、推荐顺序、§11.1、§14 四处 `cp` 与门禁表改 `.env.local`；§7.3 示例块与两处密钥规则同步。

**验收**：包目录 cwd 冒烟加载 `.env.local` 成功；清空 shell env 后 medical-kb 24/24、agent 27/27（均 live）自加载通过；db 39/39、twin-mcp 41/41、engagement-mcp 32/32；全仓 typecheck 0 错误；用户 close confirm OGT-1 可用。

---

### feature-05 Done：定时刷新数字分身（TWIN2-01）

**原因**：TWIN2-01 需系统按计划自动刷新已保存数字分身；ADR-013 要求 build 完成后经 `ensureDoingNow` 回填洞察、`add_hcp` 异步触发共用管线。

**变更内容**：
- `@hca/hcp-twin-mcp`：`scheduler/refresh.ts`（`createRefreshScheduler`，cron 门 / TTL / 排除 `_agent_general` / 顺序执行 / 失败隔离 / JSON 结构化 stderr 日志）与 `scheduler/boot.ts` 装配；`build/queue.ts` 加 `onBuildComplete` 钩子与 `waitFinished`；依赖 `node-cron ^3.0.3`。
- `@hca/hcp-engagement-agent`：`ensure-doing-now.ts`（幂等 / in-flight 去重 / LLM 失败降级 pending）。
- `@hca/hcp-engagement-mcp`：`add_hcp` 注入 `TriggerBuildFn`，写库成功后异步触发 build 并返回 `refresh: { run_id }`；触发失败仅记日志不阻塞写库。
- 规格：ADR-013 相关口径已在前序变更同步。

**验收**：twin-mcp 41/41、engagement-mcp 32/32、db 39/39、agent 27/27（live LLM）；typecheck 全绿；用户 close confirm feature-05 可用；`product-backlog.md` TWIN2-01 行 Done。

---

### feature-06 Done：元数据层 MySQL 方言修复（DEF-002 关闭）

**原因**：DEF-002：`jobs.ts` 与 `api.ts` / `academic.ts` 的元数据读写仍是 Postgres 方言（`$n` 占位、`ANY($2::text[])`、`ON CONFLICT DO UPDATE`、`RETURNING *`），打 MySQL 池必失败；ADR-005 迁移遗留，被过期 db dist 掩盖。

**变更内容**：
- `@hca/medical-kb`：`jobs.ts` 五函数改 MySQL 方言（`?` 占位、`IN (?, ?)`、写后按 `job_id` 回读 SELECT、`error` 列写 `JSON.stringify` 读侧容错解析）；`api.ts` / `academic.ts` 两个 manifest upsert 改 `INSERT ... AS new ON DUPLICATE KEY UPDATE` 并导出；`IngestJobRow extends RowDataPacket` 对齐 db 包模式；新增 type-only 依赖 `mysql2 ^3.24.6`。
- 新增 `src/mysql-dialect.test.ts` 11 用例（mock `getPool`，断言方言形状、参数与占位符一致、回读与 JSON 往返）。
- [issues-log](issues-log.md)：DEF-002 移入已关闭。
- 知识笔记：[local-binary-exec-bit.md](knowledge/ops/local-binary-exec-bit.md)。

**验收**：medical-kb 24/24（含 live MySQL 真跑 upsert / jobs 路径与 Qdrant 灌库检索）、`@hca/hcp-engagement-agent` 27/27 回归、全仓 typecheck 0 错误、全仓 dist 重建；用户 close confirm feature-06 与 DEF-002 关闭。

---

### ADR-013：洞察 LLM 合成三触发源与幂等回填（specs 同步）

**原因**：用户确认组合方案——`add_hcp` 写库成功后异步触发一次刷新（返回 `refresh: { run_id }`）；`get_hcp_insights` 空模板且事实足够时服务器内合成并写回缓存。否则不经网页的 MCP 调用方拿不到 LLM 洞察，链路不闭环。

**变更内容**：
- 新增 [ADR-013](../docs/adr/ADR-013-insight-synthesis-triggers.md)：统一幂等入口 `ensureDoingNow(hcpId)`；三触发源（build 完成、TWIN2-01 定时、`get_hcp_insights` 按需）收敛到该入口；LLM 失败降级空模板 + `pending`；`get_hcp_insights` `readOnlyHint` 改 `false`，并写明对 ADR-012 的修订（洞察缓存回填属数据面幂等写，非决策面）。
- `mcp2-design.md`：§3 映射表 `get_hcp_insights`、`add_hcp` 行更新；§8 增补异步触发；新增 §9 `get_hcp_insights` 技术设计。
- `agent-design.md`：§3 新增 `ensureDoingNow` 入口行；§5 路径 A 补三触发源。
- `architecture.md`：§5.2 工具表 `get_hcp_insights` 行；§6 TWIN2-01 表补洞察合成与 `add_hcp` 联动；§9 Sprint 2/3 门禁补 ADR-013 项；§11 决策表补 ADR-2.0-7。
- `product-backlog.md`：MCP2-02、MCP2-03、TWIN2-01 需求 bullets 更新 + 变更记录行。
- 代码无变更：实现随 Sprint 2 的 feature-05（基建）与 feature-01（接线）落地。

**验收**：specs 全文 `get_hcp_insights` 不再标注纯读；ADR-013 与五处 specs 口径一致。

---

### Sprint 排期：Sprint 3 并入 Sprint 2

**原因**：用户确认 Option A，将 Sprint 3 的合规检索与定时刷新与 Sprint 2 的数据面洞察、学术检索、Agent ROCKS 合并为一轮交付。

**变更内容**：
- `product-backlog.md`：MCP2-05、TWIN2-01 的 Sprint 列改为 Sprint 2。
- `sprint-backlog.md`：Sprint 2 目标更新；新增 SBI feature-04 / feature-05；移除 Sprint 3 章节；Total sprints 改为 2。
- `status.md`：项目进度与下一步可选对齐合并后的 Sprint 2。

**验收**：`sprint-backlog.md` 仅 Sprint 1（Done）与 Sprint 2（ToDo）；五条未完成 PBI 的 Sprint 列均为 Sprint 2。

---

## 2026-10-20

### ADR-012：对外 MCP 2.0 只暴露数据面（specs 同步）

**原因**：外部 agent 调用方 prompt 可被注入，服务器无法验证其意图与 `product_context`；受监管内容的生成与合规闸门触发须留在可信执行环境。

**变更内容**：
- 新增 [ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)：工具集改为 `list_hcp`、`query_hcp`、`add_hcp`、`get_hcp_insights`、`retrieve_academic`、`retrieve_compliance`；`propose_engagement_options` / `precheck_compliance` 移除；`tenant_id` 不作工具入参；本地草拟与远程提案边界写明。
- specs 同步：product-backlog（概览、pb-4/pb-5、PBI 表、变更记录）、mcp2-design（§1 边界、§3 映射）、mcp2-stories（US-MCP2-002/003）、mcp2-test（§3 门禁）、architecture（§5.2、§5.5、AGT2-01 交付面、Sprint 门禁）、sprint-backlog（Sprint 2/3 目标与 feature 行）。
- 代码无变更：Agent 包内部五 tool 与包级 API 不变；`retrieve_*` 两个 MCP 工具随 Sprint 2/3 落地。

**验收**：specs 全文不再把 propose / precheck 列为对外工具；ADR-012 与六处 specs 口径一致。

---

### Sprint 1 关闭（sprint-end）

**原因**：四条 SBI（task-01、feature-01、feature-02、feature-03）均 Done；用户确认 Sprint Goal 达成（不打开 Web 即可列表、查询并新增已保存 HCP）。

**验收**：`list_hcp` 实调 count=6；朱大龙经 `query_hcp` 库外检出、`add_hcp` 写入成功（`hcp_a5054096151`）；三包测试与 typecheck 全绿。

---

### OGT-1 / feature-03 Done：add_hcp 候选令牌门与 query_hcp 库外检索扩展

**原因**：Sprint 1 需集成方经 `query_hcp` 库外检出、人选认后 `add_hcp` 写库；库内医院/科室短式包含匹配（ADR-011）；写前模糊查重（ADR-009）与候选令牌（ADR-010）。

**变更内容**：
- `@hca/domain`：`AuthorIdsSchema.openalex_aliases`（ADR-004 加式）。
- `@hca/db`：`confirmAndSaveTwin` / `normalizeAuthorIds`；`filtersMatch` ADR-011；导出 `NameMatchTier`、`normalizeCompare`。
- `@hca/hcp-engagement-mcp`：`CandidateStore`；`query_hcp` `include_external` + `internalMcpUrl`；`add_hcp` `candidate_id` 门；契约测 29 项。
- 规格与 ADR：`mcp2-design` §6 增补 / §8、`mcp2-test` §6 增补 / §9、`mcp2-stories` US-MCP2-004/006；`5.hcp-twin-data-dictionary` §3.2.1；[ADR-010](../docs/adr/ADR-010-external-resolve-and-candidate-token.md)、[ADR-011](../docs/adr/ADR-011-hospital-department-substring-match.md)。

**验收**：`@hca/domain` 12/12、`@hca/db` 39/39、`@hca/hcp-engagement-mcp` 29/29；typecheck 三包通过；实机降级路径、完整旅程（含令牌作废）；用户实调朱大龙·鼓楼医院·内分泌科写入 `hcp_a5054096151`；close confirm OGT-1 / feature-03 可用。

---

### feature-02 Done：list_hcp 对外工具

**原因**：Sprint 1 需集成方通过 MCP 列出与 Web 同范围的已保存 HCP（不含 `_agent_general`）。

**变更内容**：
- `@hca/hcp-engagement-mcp`：`list_hcp` 接 `@hca/db` `listTwins`，返回 `{ count, items }`；`ListTwinsFn` 可注入；DB 失败映射 `INTERNAL_ERROR`。
- 契约测：`list_hcp` 全量/空库/错误不泄漏连接串；`add_hcp` stub 测改用合法必填参数。
- 规格：`specs/mcp2.0/mcp2-stories.md`（US-MCP2-005）、`mcp2-design.md` §7、`mcp2-test.md` §8。

**验收**：`npm run test -w @hca/db` 23/23、`@hca/hcp-engagement-mcp` 9/9；MCP 实调 `list_hcp` count=5、无 `_agent_general`；用户 close confirm feature-02 可用。

---

## 2026-10-19

### feature-01 Done：query_hcp 与 DEF-001 MySQL 对齐

**原因**：Sprint 1 需可用的 `query_hcp`；`DATABASE_URL` 为 MySQL 时 `@hca/db` 必须用 mysql2 方言；集成方需拉丁姓名逗号、连字符、称谓与模糊规则。

**变更内容**：
- `@hca/db`：`mysql2` 客户端与 MySQL 迁移路径；`nameMatchTier`（词序、编辑距离、逗号/连字符/撇号/行首称谓）。
- `@hca/hcp-engagement-mcp`：`query_hcp` 接 `queryTwins`；`name` 参数说明与 [mcp2-design §6](mcp2.0/mcp2-design.md)。
- 规格：`specs/db/*`、`specs/mcp2.0/*`；[ADR-005](../docs/adr/ADR-005-mysql-primary-store.md) 落地。

**验收**：`npm run test -w @hca/db` 23/23、`@hca/hcp-engagement-mcp` 6/6；MCP 实查 `yalin han`、`changxi wang`、`zhutongyu` count≥1；用户 close confirm feature-01 与 DEF-001 可用。

---

## 2026-10-19

### DEF-001 Closed：@hca/db 运行时 pg → mysql2

**原因**：P0 缺陷；MCP 与 Web BFF 共用 `@hca/db`，Postgres 驱动与 MySQL URL 不兼容。

**变更内容**：同 feature-01 的 `@hca/db` 修复；[issues-log](issues-log.md) 移入已关闭。

**验收**：Close Check 满足（两包测试绿、无运行时 `pg`、MCP 按姓名可命中已保存医生）。

---

## 2026-10-19

### task-01 Done：对外 MCP 2.0 骨架与 HTTP-only（ADR-008）

**原因**：Sprint 1 需可本地启动的 `@hca/hcp-engagement-mcp`，注册 `list_hcp` / `query_hcp` / `add_hcp`（stub）；传输定稿为仅 Streamable HTTP。

**变更内容**：
- 新建 `packages/hcp-engagement-mcp`（server / transport / cli、4 条 vitest、根 `dev:hcp-engagement-mcp`）。
- [ADR-008](../docs/adr/ADR-008-mcp2-http-only-transport.md)：移除 stdio 与 `MCP2_TRANSPORT`；`.cursor/mcp.json` 为 `url: http://localhost:3300/mcp`。
- 同步 `specs/mcp2.0/*`、`specs/architecture.md`、`specs/release.md`。

**验收**：包测试 4/4；`GET /health` 与 MCP initialize 烟测通过；用户 close confirm 可用。

---

## 2026-10-19

### OGT-1 / RID-1 收口：specs/.secrets 与 .gitignore、.env.example

**原因**：生产密钥散落 `specs/.tmp` 且无 gitignore 防护；`.env.example` 示例连接串停留在 ADR-005 之前的 Postgres。

**变更内容**：
- 新建 gitignored `specs/.secrets`（野草云3 凭证 + 2026-10-19 SSH 实测的生产 `DATABASE_URL` / DASHSCOPE Key / 镜像 tag）。
- `.gitignore` 补 `specs/.secrets`、`specs/.tmp`。
- `.env.example`（用户确认 diff 后）：`DATABASE_URL` 示例改 MySQL（ADR-005）；追加 2.0 键 `TWIN_REFRESH_CRON` / `TWIN_REFRESH_TTL_HOURS` / `MCP2_TRANSPORT` / `MCP2_PORT`（注释态）；其余行不动。
- 新建 `specs/knowledge/ops/secrets-file-gitignore-first.md` 与 README 索引。

**验收**：SSH 只读实测三容器健康（Up 29h，mcp healthy）；`git status` 不再显示 `specs/.tmp`；用户确认 OGT-1 可关闭与 `.env.example` 写入。

---

## 2026-10-19

### 更新 artifacts-map 与技术规格索引

**原因**：`sdd-audit-artifacts` 需 Usable；2.0 对外 MCP 需可打开的 function-spec。

**变更内容**：
- `artifacts-map.json`：五 process 文件、各模块 `*-function-spec.md`、`specs/mcp2.0/mcp2-function-spec.md`；移除不存在的 `specs/.secrets`。
- 新建 `specs/adr/`、`specs/knowledge/` 占位目录。

**验收**：审计打开 map 所列路径无 failed；`specs/.secrets` 不再出现在 map（密钥仍用 `.env` / `.env.example`）。

---

## 2026-10-19

### mcp2.0 工程三件套与 release.md

**原因**：审计与 Sprint 1 需要可打开的 design / stories / test；发布说明独立于 spec1.0。

**变更内容**：新增 `specs/mcp2.0/mcp2-design.md`、`mcp2-stories.md`、`mcp2-test.md`、`specs/release.md`；更新 `artifacts-map.json` 与 sprint-backlog `task-01` 引用。

**验收**：`sdd-audit-artifacts` 为 Usable。

---

## 2026-10-19

### 移除 mcp2-function-spec 索引

**原因**：2.0 对外 MCP 契约以 `product-backlog.md` 为准，不单独维护 `mcp2-function-spec.md`。

**变更内容**：删除 `specs/mcp2.0/mcp2-function-spec.md`；`artifacts-map.json` 中 `mcp2.0` 模块 `files` 为空。

**验收**：`sdd-audit-artifacts` 为 Usable。

---

## 2026-10-19

### 2.0 三轮 Sprint 排期（Sprint 1–3 Option A）

**原因**：用户确认 Sprint 1–3 均为 Option A；Sprint 1 增加对外 MCP 2.0 骨架 Task。

**变更内容**：
- `specs/product-backlog.md`：8 条 Implementable PBI 的 `Sprint` 列由 — 设为 Sprint 1 / 2 / 3。
- `specs/sprint-backlog.md`：新建 Sprint 1–3 段落与 SBI 表；Sprint 1 含 `task-01` 与三条 Feature SBI。
- `specs/status.md`：新建，当前 Sprint 1 ToDo。
- `specs/issues-log.md`：新建空表。

**验收**：`product-backlog.md` 与 `sprint-backlog.md` 中 PBI 与 SBI 一一对应；未排期 PBI 表为空。

**边界**：不含代码实现与 `artifacts-map.json` 索引更新。
