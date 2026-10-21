<a id="sprint-backlog-hcp-engagement-assistant"></a>

# Sprint Backlog — HCP Engagement Assistant

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-21
> [Definition](../.cursor/templates/framework.sdd.works/sdd-scrum-practices.md#sprint-backlogmd)

## 当前项目进度

- Total sprints: 2
- Current WIP sprint: Sprint 2
- Sprint goal: 集成方通过对外 MCP 读取 HCP 洞察并检索学术与合规证据引用，系统按计划自动刷新已保存数字分身，且 Agent 在 ROCKS 范式下达到可验收质量。

<a id="index"></a>

### 目录

- [RID Log](#rid-log-risksimpediments-dependencies)
- [Sprint 1](#sprint-1)
- [Sprint 2](#sprint-2)
- [未排期 PBI](#unplanned-pbis)

---

<a id="rid-log-risksimpediments-dependencies"></a>

## RID Log（Risks, Impediments, Dependencies）

[返回文首](#sprint-backlog-hcp-engagement-assistant)

> 本节记录整个项目的风险、阻碍与依赖，不属于任一 sprint。

### 未关闭 RID

| # | Severity | Title | Description | Impact | Solution | Related | Created Sprint |
| --- | --- | --- | --- | --- | --- | --- | --- |

### 已关闭 RID

| # | Severity | Title | Description | Impact | Solution | Related | Closed Sprint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 中 | 生产密钥缺单一真相源 | 发布手册落成时，生产密钥（SSH、`DATABASE_URL`、LLM Key）只散落在临时文件 `specs/.tmp`，且 `.gitignore` 未覆盖；公开仓库有误提交风险，运维排障无安全入口 | 部署与排障需人工翻临时文件；有误连他库与密钥泄露风险 | 已建 gitignored `specs/.secrets` 并经 SSH 实机核对写入生产配置（2026-10-19）；`.gitignore` 已补 `specs/.secrets` / `specs/.tmp`；教训入 `specs/knowledge/ops/secrets-file-gitignore-first.md` | [release.md](./release.md) · OGT-1 | - |

---

## Definition of Done

每个 sprint 条目与 Product Backlog 共用同一套清单：`sdd-dod.mdc`，以及 [product-backlog.md 中的 Definition of Done](./product-backlog.md#definition-of-done)。只有全部检查通过，才能把该行标为 **Done**。

某一 sprint 下某一行可另设 **Additional Done Criteria**，写在对应 sprint 段落里。它是对该行追加的检查，不是表格新列。

---

<a id="sprint-1"></a>

## Sprint 1

[返回文首](#sprint-backlog-hcp-engagement-assistant)

Sprint Goal: 集成方通过对外 MCP 列出、查询并新增已保存 HCP，以便在不打开 Web 的情况下维护医生主数据。

**Status: Done**

### **Done**

Additional Done Criteria, on top of the Definition of Done:

- `task-01`：`packages` 下对外 MCP 进程可本地启动；六工具中的 `list_hcp`、`query_hcp`、`add_hcp` 已在 SDK 中注册（实现可为 stub，须可列出工具名）；transport 在 [mcp2-design.md](mcp2.0/mcp2-design.md) 与 [release.md](release.md) 中写明。

| # | Code | SBI | Parent PBI | Module/Type | Related specs | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | feature-01 | query_hcp 对外工具 | [MCP2-01 query_hcp · 查询 HCP](./product-backlog.md#L60) | mcp2.0/Feature | - [product-backlog MCP 需求](./product-backlog.md#external-service)<br>- [Web Twin API](app/app-function-spec.md) | **Done** |
| 2 | feature-02 | list_hcp 对外工具 | [MCP2-06 list_hcp · 列出 HCP](./product-backlog.md#L69) | mcp2.0/Feature | - [product-backlog MCP 需求](./product-backlog.md#external-service)<br>- [Web 分身列表](app/app-function-spec.md) | **Done** |
| 3 | feature-03 | add_hcp 对外工具 | [MCP2-02 add_hcp · 新增 HCP](./product-backlog.md#L75) | mcp2.0/Feature | - [product-backlog MCP 需求](./product-backlog.md#external-service)<br>- [Web 确认保存](app/app-function-spec.md) | **Done** |
| 4 | task-01 | 对外 MCP 2.0 进程与工具注册骨架 | [MCP2-01 query_hcp · 查询 HCP](./product-backlog.md#L60) | mcp2.0/Task | - [mcp2-design.md](mcp2.0/mcp2-design.md)<br>- [mcp2-test.md](mcp2.0/mcp2-test.md) | **Done** |

### Retrospective

**Learnings**

1. task-01：本地 Cursor 与生产共用 Streamable HTTP（ADR-008），避免 stdio 与 `dist/` 产物不同步；见 [ADR-008](../docs/adr/ADR-008-mcp2-http-only-transport.md)。
2. task-01：陈旧 `@esbuild/darwin-arm64/bin/esbuild` 无 `+x` 会导致 `npm install` EACCES；见 [npm-esbuild-stale-binary-perms.md](./knowledge/ops/npm-esbuild-stale-binary-perms.md)。
3. feature-01：Vitest mock `pg` 会掩盖 MySQL 方言失败；DEF-001 与 query_hcp 宜同一 PR 验收。
4. feature-01：无空格拉丁串（如 `changxiwang`）不会词序互换；规格未要求，调用方应传空格或中文名。
5. feature-02：`list_hcp` 与 `query_hcp` 共用「薄 handler + `@hca/db` + 可注入」；测 stub 的 `add_hcp` 须传 schema 必填字段，空参在 SDK 校验层失败、到不了 handler。
6. OGT-1 / feature-03 done：缺 `candidate_id` 在 MCP SDK Zod 层失败，契约测断言 `isError` + 正文含字段名；见 [mcp2-test §9](mcp2.0/mcp2-test.md)。
7. OGT-1 / feature-03 done：改 `@hca/domain` 后须 `npm run build -w @hca/domain`，否则 `@hca/db` 单测仍读旧 dist。
8. OGT-1 / feature-03 done：`.env` 中 `MCP_URL` 常缺 `/mcp`；对外服务用 `internalMcpUrl` 补全，否则库外检索恒降级。

**Opportunities**

1. task-01：根 `Makefile` 的 `up`/`down` 可封装 `dev:hcp-engagement-mcp`，减少 HTTP 模式「进程未起 Cursor 连不上」。
2. feature-01：`loadRootEnv` 与 Web 500 错误体净化仍分散，可另开小任务。
3. feature-02：全量 list 无分页；HCP 规模显著增大时再开 PBI 讨论 limit/cursor。
4. OGT-1 / feature-03 done：根 `.env` / `.env.local` 可将 `MCP_URL` 改为 `http://127.0.0.1:3200/mcp`，与 release 示例一致。

**Future actions**

1. task-01：下一条同类本地 MCP 故事开工前，在 README 或 release §6.1 补一句「改 mcp.json 后 Reload Window + 确认 :3300 在跑」。
2. feature-01 / DEF-001：合并 mysql2 与姓名规则时，先跑 `@hca/db` 纯函数再启 MCP；重启后 Cursor 需 Reload MCP 会话。
3. feature-02：下一条写库类工具（feature-03 `add_hcp`）开工前，先写 InMemoryTransport 契约测再换 stub；**landed**（OGT-1 已先契约测再接实库）。
4. OGT-1 / feature-03 done：下一条需连对内 MCP 的对外工具故事开工前，在 release §6 或 README 写一句「`MCP_URL` 须含 `/mcp` 或依赖 `internalMcpUrl`」。
5. Sprint-end：Sprint 2 sprint-end 时回看本 sprint 遗留 Future actions #1 与 #4 是否落地。

**Learnings**

9. Sprint-end：Sprint 1 为首个 sprint，无更早 sprint 的 Future action 需评分；四条 SBI 全部 Done，Sprint Goal 经实机验证达成（`list_hcp` count=6、朱大龙经 `query_hcp` 检出 + `add_hcp` 写入成功）。

**Opportunities**

5. Sprint-end：改进项 #1（Makefile up/down 封装）与 #2（loadRootEnv/错误净化）未落地，Sprint 2 开工时评估是否顺手处理或开新故事。

---

<a id="sprint-2"></a>

## Sprint 2

[返回文首](#sprint-backlog-hcp-engagement-assistant)

Sprint Goal: 集成方通过对外 MCP 读取 HCP 洞察并检索学术与合规证据引用，系统按计划自动刷新已保存数字分身，且 Agent 在 ROCKS 范式下达到可验收质量。

依赖 Sprint 1 对外 MCP 进程与 HCP 主数据工具。

**Status: WIP**

### **Done**

| # | Code | SBI | Parent PBI | Module/Type | Related specs | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | feature-13 | 合规知识覆盖信号与条款版本治理 | [MKB2-03 合规知识覆盖信号与条款版本治理](./product-backlog.md#pb-13) | rag/Feature | - [F-RAG-030–032](rag/rag-function-spec.md)<br>- [US-RAG-008](rag/rag-stories.md)<br>- [mcp2-design §11](mcp2.0/mcp2-design.md)<br>- [ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md) | **Done** |
| 12 | feature-12 | add_hcp 入库科室以选中记录信号专科为准 | [MCP2-10 add_hcp 入库科室以选中记录信号专科为准（DEF-006，D2）](./product-backlog.md#pb-16) | mcp2.0/Task | - [US-MCP2-007 增补](mcp2.0/mcp2-stories.md)<br>- [mcp2-design §13.6](mcp2.0/mcp2-design.md)<br>- [mcp2 测试计划 §15](mcp2.0/mcp2-test.md)<br>- [DEF-006](issues-log.md)<br>- [F-WEB-047 增补](app/app-function-spec.md) | **Done** |
| 11 | feature-11 | add_hcp 入库科室校验与预灌映射预览 | [MCP2-09 add_hcp 入库科室校验与预灌映射预览](./product-backlog.md#pb-14) | mcp2.0/Task | - [US-MCP2-007](mcp2.0/mcp2-stories.md)<br>- [mcp2-design §13](mcp2.0/mcp2-design.md)<br>- [mcp2 测试计划 §14](mcp2.0/mcp2-test.md)<br>- [DEF-005](issues-log.md) | **Done** |
| 10 | feature-10 | 学术索引写入与恢复健壮性修复 | [MKB2-04 学术索引写入与恢复健壮性修复（DEF-003 / DEF-004）](./product-backlog.md#pb-15) | rag/Task | - [US-RAG-009](rag/rag-stories.md)<br>- [rag-design §20](rag/rag-design.md)<br>- [rag 测试计划 §7](rag/rag-tests.md) | **Done** |
| 9 | feature-09 | 受控学科目录扩充与学术索引批量种子 | [MKB2-02 受控学科目录扩充与学术索引批量种子](./product-backlog.md#pb-12) | rag/Feature | - [ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)<br>- [rag 功能规格 ingest_on_demand](rag/rag-function-spec.md) | **Done** |
| 7 | feature-07 | 知识覆盖对齐（add_hcp 预灌 + coverage 信号） | [MCP2-07 知识覆盖对齐 · add_hcp 预灌 + retrieve_academic coverage 信号](./product-backlog.md#pb-10) | mcp2.0/Feature | - [Web 确认保存 F-WEB-039](app/app-function-spec.md)<br>- [ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md) | **Done** |
| 6 | feature-06 | 元数据层 MySQL 方言修复 | [MKB2-01 元数据层 MySQL 方言修复（DEF-002）](./product-backlog.md#pb-9) | rag/Task | - [US-RAG-006](rag/rag-stories.md)<br>- [rag 测试计划](rag/rag-tests.md) | **Done** |
| 5 | feature-05 | 定时刷新数字分身 | [TWIN2-01 定时自动更新数字分身](./product-backlog.md#L106) | mcp/Task | - [对内 build_twin](mcp/mcp-function-spec.md)<br>- [安装与运行 §11](spec1.0/4.install-dependencies.md) | **Done** |
| 2 | feature-02 | retrieve_academic 对外工具 | [MCP2-04 retrieve_academic · 学术证据检索](./product-backlog.md#L88) | mcp2.0/Feature | - [Agent 学术检索 I-AGT-007](agent/agent-function-spec.md)<br>- [Web 洞察页](app/app-function-spec.md) | **Done** |
| 1 | feature-01 | get_hcp_insights 对外工具 | [MCP2-03 get_hcp_insights · HCP 洞察](./product-backlog.md#L82) | mcp2.0/Feature | - [Agent 洞察](agent/agent-function-spec.md)<br>- [Web 洞察页](app/app-function-spec.md) | **Done** |

### **ToDo**

| # | Code | SBI | Parent PBI | Module/Type | Related specs | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | feature-03 | Agent ROCKS 质量优化 | [AGT2-01 Agent 优化 · ROCKS 范式](./product-backlog.md#L115) | agent/Feature | - [Agent 功能规格](agent/agent-function-spec.md)<br>- [Agent 设计](agent/agent-design.md) | **ToDo** |
| 4 | feature-04 | retrieve_compliance 对外工具 | [MCP2-05 retrieve_compliance · 合规条款检索](./product-backlog.md#L94) | mcp2.0/Feature | - [Agent 合规检索 I-AGT-008](agent/agent-function-spec.md)<br>- [Web 合规检查](app/app-function-spec.md) | **ToDo** |
| 8 | feature-08 | ingest_academic 对外工具 | [MCP2-08 ingest_academic · 学术知识按需灌注](./product-backlog.md#pb-11) | mcp2.0/Feature | - [rag 功能规格 ingest_on_demand](rag/rag-function-spec.md)<br>- [ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md) | **WIP** |

### Retrospective

**Learnings**

#### 1. [Oct 20, 2026], feature-06 done
- `tools/qdrant/qdrant` 丢执行位使 `start-qdrant.sh` 误判「未安装」而重新下载，卡在 GitHub 直连 0 字节；`chmod +x` 已有二进制即恢复，见 [local-binary-exec-bit.md](./knowledge/ops/local-binary-exec-bit.md)。
- 改 `@hca/db` 等被依赖包源码后不重建 dist 会掩盖跨包缺陷：Sprint 1 Learnings #7 在 feature-06 复发，全仓重建后 DEF-002 才在 typecheck 暴露。
- 在普通 Shell 调用里 `nohup ... &` 起的常驻进程会在命令结束后被回收；本地常驻服务（Qdrant）须用可存续的后台终端承载。

#### 2. [Oct 20, 2026], feature-05 done
- 回顾门已运行，无新增 durable 教训；stale dist 复发教训已在本 sprint #1 记录，调度器测试模式（mock node-cron 断言到点回调）属实现细节不入知识库。

#### 3. [Oct 21, 2026], feature-01 get_hcp_insights 对外工具 done
- 验收演示把 MCP `structuredContent` 排版进 chat 后，用户追问「是工具返回还是你生成的」；此后同类演示须在首句标明数据来自 `tools/call`。
- ADR-013 假设成立：`ensureDoingNow` 已在 feature-05 落地，本故事只做 MCP 接线。

#### 4. [Oct 21, 2026], feature-02, feature-07, feature-09, feature-10, feature-11, feature-12 done
- OpenAlex 作者级 `x_concepts` 只有约 5 个宽泛主题词，专科信号在论文级 concepts（`select=concepts`）经概念映射表归一，见 [openalex-department-signal-works-concepts.md](./knowledge/data/openalex-department-signal-works-concepts.md)。
- stale dist 掩盖新导出的教训再次复发（`openAlexConceptSpecialty is not a function`），改被依赖包导出后必须先重建 dist 再跑下游测试。
- ADR-013 / ADR-014 假设成立：叶定伟 live 验收中 `add_hcp` 预灌与 `coverage: ready` 信号按预期工作，无需修订。

#### 5. [Oct 21, 2026], feature-13 合规知识覆盖信号与条款版本治理 done
- Live 验收脚本须放在 workspace 根并用 `.mts` 后缀，否则 `/tmp` 下模块解析与 top-level await 易失败，见 [tsx-live-verify-from-workspace-root.md](./knowledge/ops/tsx-live-verify-from-workspace-root.md)。
- `retrieveCompliance` 单测里 `rerank` mock 须为 `(query, texts)` 双参，与生产签名一致。
- ADR-014 假设在合规侧成立：coverage 以 manifest 为准、sparse 附 repair_hint、seed 下线旧版本与学术侧同语义；MCP `retrieve_compliance` 接线仍归 feature-04。

**Opportunities**

#### 1. [Oct 20, 2026], feature-06 done
- `start-qdrant.sh` 可改为「已有二进制优先 `chmod +x` 复用，仅在缺失时下载」，避免 GitHub 直连停滞阻塞 live 测试。

#### 4. [Oct 21, 2026], feature-02, feature-07, feature-09, feature-10, feature-11, feature-12 done
- 医院中英文名归一是下一个匹配质量缺口：库内存 `Nanfang Hospital` 时中文「南方医院」查不到库内记录，可另立小故事。

**Future actions**

#### 1. [Oct 20, 2026], feature-06 done
- 下一条依赖本地 Qdrant 的 SBI 开工前，把「复用已有二进制（含 `chmod +x`）」落进 `scripts/start-qdrant.sh`；检查点：下一条同类 SBI。

#### 3. [Oct 21, 2026], feature-01 get_hcp_insights 对外工具 done
- 下一条对外 MCP 工具 SBI（feature-02）验收演示首句标明 `tools/call` 来源；检查点：feature-02。

#### 4. [Oct 21, 2026], feature-02, feature-07, feature-09, feature-10, feature-11, feature-12 done
- 下一条依赖 `@hca/*` 跨包新导出的 SBI 开工前，先重建被依赖包 dist（检查点：下一条同类 SBI）；Sprint-end 时回看本条与 Opportunities #4（医院名归一）是否落成故事。

#### 5. [Oct 21, 2026], feature-13 合规知识覆盖信号与条款版本治理 done
- 下一条需 Qdrant + MySQL live 脚本验收的 SBI 开工前，在 release 或 README 补一句「临时脚本放仓库根 `.tmp-*.mts`」；检查点：下一条同类 SBI。

---

<a id="unplanned-pbis"></a>

## 未排期 PBI

[返回文首](#sprint-backlog-hcp-engagement-assistant)

> 尚未排入 sprint 的 Product Backlog 项。表格与 `product-backlog.md` 中的 Product Backlog 表一致，但不含 `Sprint` 列。PBI 编号链接到 `./product-backlog.md#L{line}` 上对应 Requirements 行。不要在本文件里再建 `#pb-N` 锚点。

| # | Component | PBI Code | Description | Size | Related | Status |
| --- | --- | --- | --- | --- | --- | --- |
