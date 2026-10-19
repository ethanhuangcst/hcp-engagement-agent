<a id="sprint-backlog-hcp-engagement-assistant"></a>

# Sprint Backlog — HCP Engagement Assistant

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-19
> [Definition](../.cursor/templates/framework.sdd.works/sdd-scrum-practices.md#sprint-backlogmd)

## 当前项目进度

- Total sprints: 3
- Current WIP sprint: none
- Sprint goal: none

<a id="index"></a>

### 目录

- [RID Log](#rid-log-risksimpediments-dependencies)
- [Sprint 1](#sprint-1)
- [Sprint 2](#sprint-2)
- [Sprint 3](#sprint-3)
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

---

## Definition of Done

每个 sprint 条目与 Product Backlog 共用同一套清单：`sdd-dod.mdc`，以及 [product-backlog.md 中的 Definition of Done](./product-backlog.md#definition-of-done)。只有全部检查通过，才能把该行标为 **Done**。

某一 sprint 下某一行可另设 **Additional Done Criteria**，写在对应 sprint 段落里。它是对该行追加的检查，不是表格新列。

---

<a id="sprint-1"></a>

## Sprint 1

[返回文首](#sprint-backlog-hcp-engagement-assistant)

Sprint Goal: 集成方通过对外 MCP 列出、查询并新增已保存 HCP，以便在不打开 Web 的情况下维护医生主数据。

**Status: ToDo**

### **ToDo**

Additional Done Criteria, on top of the Definition of Done:

- `task-01`：`packages` 下对外 MCP 进程可本地启动；六工具中的 `list_hcp`、`query_hcp`、`add_hcp` 已在 SDK 中注册（实现可为 stub，须可列出工具名）；transport 在 [mcp2-design.md](mcp2.0/mcp2-design.md) 与 [release.md](release.md) 中写明。

| # | Code | SBI | Parent PBI | Module/Type | Related specs | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | feature-01 | query_hcp 对外工具 | [MCP2-01 query_hcp · 查询 HCP](./product-backlog.md#L60) | mcp2.0/Feature | - [product-backlog MCP 需求](./product-backlog.md#external-service)<br>- [Web Twin API](app/app-function-spec.md) | **ToDo** |
| 2 | feature-02 | list_hcp 对外工具 | [MCP2-06 list_hcp · 列出 HCP](./product-backlog.md#L69) | mcp2.0/Feature | - [product-backlog MCP 需求](./product-backlog.md#external-service)<br>- [Web 分身列表](app/app-function-spec.md) | **ToDo** |
| 3 | feature-03 | add_hcp 对外工具 | [MCP2-02 add_hcp · 新增 HCP](./product-backlog.md#L75) | mcp2.0/Feature | - [product-backlog MCP 需求](./product-backlog.md#external-service)<br>- [Web 确认保存](app/app-function-spec.md) | **ToDo** |
| 4 | task-01 | 对外 MCP 2.0 进程与工具注册骨架 | [MCP2-01 query_hcp · 查询 HCP](./product-backlog.md#L60) | mcp2.0/Task | - [mcp2-design.md](mcp2.0/mcp2-design.md)<br>- [mcp2-test.md](mcp2.0/mcp2-test.md) | **ToDo** |

### Retrospective

**Learnings**

尚无记录。

**Opportunities**

尚无记录。

**Future actions**

尚无记录。

---

<a id="sprint-2"></a>

## Sprint 2

[返回文首](#sprint-backlog-hcp-engagement-assistant)

Sprint Goal: 集成方通过对外 MCP 读取 HCP 洞察并生成一人一策，同时 Agent 在 ROCKS 范式下达到可验收质量，以便洞察与方案链路可对外复用。

依赖 Sprint 1 对外 MCP 进程与 HCP 主数据工具。

**Status: ToDo**

### **ToDo**

| # | Code | SBI | Parent PBI | Module/Type | Related specs | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | feature-01 | get_hcp_insights 对外工具 | [MCP2-03 get_hcp_insights · HCP 洞察](./product-backlog.md#L81) | mcp2.0/Feature | - [Agent 洞察](agent/agent-function-spec.md)<br>- [Web 洞察页](app/app-function-spec.md) | **ToDo** |
| 2 | feature-02 | propose_engagement_options 对外工具 | [MCP2-04 propose_engagement_options · 一人一策](./product-backlog.md#L87) | mcp2.0/Feature | - [Agent proposeOptions](agent/agent-function-spec.md)<br>- [Web 一人一策](app/app-function-spec.md) | **ToDo** |
| 3 | feature-03 | Agent ROCKS 质量优化 | [AGT2-01 Agent 优化 · ROCKS 范式](./product-backlog.md#L117) | agent/Feature | - [Agent 功能规格](agent/agent-function-spec.md)<br>- [Agent 设计](agent/agent-design.md) | **ToDo** |

### Retrospective

**Learnings**

尚无记录。

**Opportunities**

尚无记录。

**Future actions**

尚无记录。

---

<a id="sprint-3"></a>

## Sprint 3

[返回文首](#sprint-backlog-hcp-engagement-assistant)

Sprint Goal: 集成方对一人一策做合规预审，且系统按计划自动刷新已保存数字分身，以便对外闭环合规并减轻人工维护。

依赖 Sprint 2 方案生成与 Agent 基线。

**Status: ToDo**

### **ToDo**

| # | Code | SBI | Parent PBI | Module/Type | Related specs | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | feature-01 | precheck_compliance 对外工具 | [MCP2-05 precheck_compliance · 合规预审](./product-backlog.md#L96) | mcp2.0/Feature | - [Agent 合规闸门](agent/agent-function-spec.md)<br>- [Web 合规检查](app/app-function-spec.md) | **ToDo** |
| 2 | feature-02 | 定时刷新数字分身 | [TWIN2-01 定时自动更新数字分身](./product-backlog.md#L108) | mcp/Task | - [对内 build_twin](mcp/mcp-function-spec.md)<br>- [安装与运行 §11](spec1.0/4.install-dependencies.md) | **ToDo** |

### Retrospective

**Learnings**

尚无记录。

**Opportunities**

尚无记录。

**Future actions**

尚无记录。

---

<a id="unplanned-pbis"></a>

## 未排期 PBI

[返回文首](#sprint-backlog-hcp-engagement-assistant)

> 尚未排入 sprint 的 Product Backlog 项。表格与 `product-backlog.md` 中的 Product Backlog 表一致，但不含 `Sprint` 列。PBI 编号链接到 `./product-backlog.md#L{line}` 上对应 Requirements 行。不要在本文件里再建 `#pb-N` 锚点。

| # | Component | PBI Code | Description | Size | Related | Status |
| --- | --- | --- | --- | --- | --- | --- |
