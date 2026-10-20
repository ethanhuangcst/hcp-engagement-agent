# 产品概览 — HCP Engagement Assistant

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-20

---

<a id="index"></a>

## 目录

- [产品概览](#product-overview)
- [Definition of Done](#definition-of-done)
- [需求](#requirements)
  - [对外服务](#external-service)
  - [后台维护](#background-maintenance)
  - [Agent](#agent)
- [Product Backlog](#product-backlog)
- [变更记录](#change-record)

---

<a id="product-overview"></a>

# 产品概览

- 2.0 让调用方不打开网页，也能完成网页上的医生数字分身列表、查询与新增、洞察，以及带引用的学术与合规证据检索；一人一策生成与合规预审不经对外 MCP（[ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)）。
- 对外 MCP 工具名统一为 `list_hcp`、`query_hcp`、`add_hcp`、`get_hcp_insights`、`retrieve_academic`、`retrieve_compliance`（数据面，[ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)）。
- Agent 优化（[AGT2-01](#pb-8)）：用 **ROCKS 范式**优化 Agent 质量，覆盖一人一策、开放对话与一句话洞察在真实 LLM 下的输出、时延与降级；经现有 Agent 包与 BFF 交付，不新增对外 MCP 工具。
- 数字分身内容的刷新由后台定时任务完成，不放在对外 MCP 里。
- 采集用的内部接口仍只给本系统使用，不作为对外入口。

[返回目录](#index)

---

<a id="definition-of-done"></a>

# Definition of Done

本节是在 `sdd-dod.mdc` 标准完成定义之上的额外产品检查。只有标准项与本节每一项都通过，才能把 PBI 标为 **Done**。

- 对外响应里不出现数据库口令或模型密钥。
- 对外入口不提供采集用的内部能力，例如消歧后的情报构建和热力刷新。

[返回目录](#index)

---

<a id="requirements"></a>

# 需求

<a id="external-service"></a>

## MCP

下列每条对应一个对外 MCP 工具（工具名见标题）。字段名与 Web BFF、`@hca/domain` 一致。出错时返回 `{ code, message, repair_hint? }`；不返回密钥、堆栈或内网路径。列表与查询结果均不含 `_agent_general` 占位医生。

- <a id="pb-1"></a>[MCP2-01](#pb-1) `query_hcp` · 查询 HCP
  - **做什么**：在已保存医生中按条件查找；命中几位就返回几位。可选一并检索库外候选（公开源检索消歧，ADR-010）。
  - **Annotations**：只读（`readOnlyHint: true`）；`openWorldHint: true`。
  - **参数**（可组合；至少传 `hcp_id` 或 `name` 之一）：
    - `hcp_id`：系统编号；存在则只查这一位（仍放在 `items` 数组里）。
    - `name`：姓名，中文或拼音均可。
    - `hospital`、`department`、`city`：均可选，用于缩小范围。医院与科室支持归一相等或包含匹配（短式如「协和医院」可命中「北京协和医院」；见 [ADR-011](../../docs/adr/ADR-011-hospital-department-substring-match.md)），城市仍归一精确。
    - `include_external`：布尔，默认 false；为 true 时检索库外候选（与库内命中同人者不重复出现）。
  - **返回**：`{ count, items[] }` 为库内命中，每条为完整数字分身及可选 `build.runId`。`include_external` 为 true 时响应另含 `external: { count, items[] }`，每条库外候选带 `candidate_id`、姓名、医院/科室/职称、文献号与命中依据；`candidate_id` 约 30 分钟有效、仅用于 `add_hcp`。外部源失败时降级为仅库内并提示，不算工具失败。
  - **失败**：`VALIDATION_ERROR`；指定 `hcp_id` 不存在时为 `NOT_FOUND`。
- <a id="pb-7"></a>[MCP2-06](#pb-7) `list_hcp` · 列出 HCP
  - **做什么**：列出全部已保存医生（与 Web「HCP 列表」同一范围）。
  - **Annotations**：只读（`readOnlyHint: true`）。
  - **参数**：无必填；2.0 **不提供** `limit`、`offset` 分页，一次返回全量。
  - **返回**：`{ count, items[] }`；含 `hcp_id`、姓名、医院、科室、`as_of`、标签、一句话洞察摘要等。
  - **失败**：`INTERNAL_ERROR`。
- <a id="pb-2"></a>[MCP2-02](#pb-2) `add_hcp` · 新增 HCP
  - **做什么**：仅新增 `query_hcp` 检索到并经人选认的库外 HCP：凭 `candidate_id` 确认身份后写入库（同 Web「确认并保存」）；不自动开始「构建情报」。写前仍按 ADR-009 姓名规则查重，命中疑似同人先返回待确认清单。
  - **Annotations**：写库；非删除；非幂等。
  - **参数**：`candidate_id`（必填，来自 `query_hcp` 库外候选）；可选 `confirm_not_duplicate`（布尔；确认疑似同人确非重复后置 `true` 强制写入）。身份字段不再由调用方填写，由候选内容生成。
  - **返回**：写入成功为 `{ twin, hcp_id, knowledge_jobs? }`；疑似同人时为 `{ status: "confirmation_required", possible_duplicates[] }`（未写库，每条含 hcp_id、姓名、医院、科室、命中档位）。写入成功后候选令牌即作废。
  - **失败**：`VALIDATION_ERROR`、`NOT_FOUND`（候选令牌不存在或已过期，需重新 `query_hcp` 后再选）、`INTERNAL_ERROR`。
- <a id="pb-3"></a>[MCP2-03](#pb-3) `get_hcp_insights` · HCP 洞察
  - **做什么**：读取洞察页数据（一句话洞察及科研、热力、机会等块）。
  - **Annotations**：只读。
  - **参数**：`hcp_id`（必填）。
  - **返回**：`{ twin, insights }`；`doing_now.summary` 为一句话洞察。
  - **失败**：`NOT_FOUND`。
- <a id="pb-4"></a>[MCP2-04](#pb-4) `retrieve_academic` · 学术证据检索
  - **做什么**：按 HCP 与条件检索 medical-kb 学术证据，返回带引用的 chunk；**不生成方案、不写库**。
  - **Annotations**：只读（`readOnlyHint: true`）；命中公开文献库（`openWorldHint: true`）。
  - **参数**：对齐 [agent/agent-function-spec.md](./agent/agent-function-spec.md) I-AGT-007（`hcp_id` 必填；`query`、`specialty`、`themes` 可选）。
  - **返回**：`{ chunks[] }`，每条含正文与 citation。
  - **失败**：`NOT_FOUND`、`INTERNAL_ERROR`。
- <a id="pb-5"></a>[MCP2-05](#pb-5) `retrieve_compliance` · 合规条款检索
  - **做什么**：检索合规知识库条款，返回条款引用（`clause_id` / `authority` / `version`）；工具 description 写明**不是预审判定、不替代**正式 MLR（[ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)）。
  - **Annotations**：只读（`readOnlyHint: true`）。
  - **参数**：对齐 I-AGT-008（`hcp_id` 必填；`query`、`interaction_type` 可选）。`tenant_id` **不作入参**：来自服务端鉴权上下文；租户鉴权未上线前仅返回全局种子。
  - **返回**：`{ chunks[] }`，每条含条款引用与 citation。
  - **失败**：`NOT_FOUND`、`INTERNAL_ERROR`。


<a id="background-maintenance"></a>

## 后台维护

- <a id="pb-6"></a>[TWIN2-01](#pb-6) 定时自动更新数字分身
  - 系统按计划对已保存医生重新采集并写回数字分身与洞察。
  - 对外 MCP 不提供手动更新或触发构建的入口。


<a id="agent"></a>

## Agent

- <a id="pb-8"></a>[AGT2-01](#pb-8) Agent 优化
  - 用 **ROCKS 范式**优化 Agent 质量：一人一策、开放对话与一句话洞察在真实 LLM 下达到可验收基线。
  - 优化范围含输出质量、时延与降级策略。
  - 优化结果通过现有 Agent 包与 BFF 交付，不新增对外 MCP 工具。

[返回目录](#index)

---

<a id="product-backlog"></a>

# Product Backlog

| # | Component | PBI Code | Description | Size | Related | Sprint | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 对外服务 | [MCP2-01](#pb-1) | query_hcp · 查询 HCP | Implementable | - [Web 分身查询与详情](app/app-function-spec.md)<br>- [对内 get_twin](mcp/mcp-function-spec.md) | Sprint 1 | Done |
| 2 | 对外服务 | [MCP2-06](#pb-7) | list_hcp · 列出 HCP | Implementable | - [Web 分身列表](app/app-function-spec.md)<br>- [对内 listTwins](mcp/mcp-function-spec.md) | Sprint 1 | Done |
| 3 | 对外服务 | [MCP2-02](#pb-2) | add_hcp · 新增 HCP | Implementable | - [Web 确认保存](app/app-function-spec.md)<br>- [对内 confirm_and_save_twin](mcp/mcp-function-spec.md) | Sprint 1 | Done |
| 4 | 对外服务 | [MCP2-03](#pb-3) | get_hcp_insights · HCP 洞察 | Implementable | - [Agent 洞察与 doing_now](agent/agent-function-spec.md)<br>- [Web 洞察页](app/app-function-spec.md) | Sprint 2 | ToDo |
| 5 | 对外服务 | [MCP2-04](#pb-4) | retrieve_academic · 学术证据检索 | Implementable | - [Agent 学术检索 I-AGT-007](agent/agent-function-spec.md)<br>- [Web 洞察页](app/app-function-spec.md) | Sprint 2 | ToDo |
| 6 | 对外服务 | [MCP2-05](#pb-5) | retrieve_compliance · 合规条款检索 | Implementable | - [Agent 合规检索 I-AGT-008](agent/agent-function-spec.md)<br>- [Web 合规检查](app/app-function-spec.md) | Sprint 3 | ToDo |
| 7 | 后台维护 | [TWIN2-01](#pb-6) | 定时自动更新数字分身 | Implementable | - [对内 build_twin](mcp/mcp-function-spec.md)<br>- [安装与运行 §11](spec1.0/4.install-dependencies.md) | Sprint 3 | ToDo |
| 8 | Agent | [AGT2-01](#pb-8) | Agent 优化 · ROCKS 范式 | Implementable | - [Agent 功能规格](agent/agent-function-spec.md)<br>- [Agent 设计](agent/agent-design.md) | Sprint 2 | ToDo |

[返回目录](#index)

---

<a id="change-record"></a>

# 变更记录

| Date | Change |
| --- | --- |
| 2026-10-20 | ADR-012：对外 MCP 只暴露数据面；MCP2-04 / MCP2-05 改为 `retrieve_academic` / `retrieve_compliance`，`propose_engagement_options` / `precheck_compliance` 退出对外工具集；见 [ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)。 |
| 2026-10-20 | `query_hcp` 可选过滤扩展：医院/科室支持包含匹配（ADR-011），城市仍归一精确。 |
| 2026-10-20 | OGT-1：`query_hcp` 增加 `include_external` 双源检索与库外候选 `candidate_id`；`add_hcp` 入参改为凭 `candidate_id` 新增；见 [ADR-010](../../docs/adr/ADR-010-external-resolve-and-candidate-token.md)。 |
| 2026-10-20 | `add_hcp` 补充写前模糊查重：与 `query_hcp` 同款姓名规则，疑似同人返回 `confirmation_required` 待确认，`confirm_not_duplicate` 确认后写入；见 [ADR-009](../../docs/adr/ADR-009-add-hcp-duplicate-check.md)。 |
| 2026-10-19 | Sprint 1–3 排期写入 Product Backlog `Sprint` 列；详见 `sprint-backlog.md`、`changes-log.md`。 |
| 2026-10-19 | 对外 MCP 工具说明并入「对外服务」功能 list，删除独立工具表与目录锚点。 |
| 2026-10-19 | 改写 MCP 工具表为自然语言：`list_hcp` 不分页；`query_hcp` 姓名中英文/拼音、条件可选、多条命中全返回；补充 `tenant_id` / `product_context` 说明。 |
| 2026-10-19 | 对外服务增加 MCP 工具表：六工具入参、返回与 annotations（对齐 BFF / domain）。 |
| 2026-10-19 | 产品概览补充 AGT2-01：用 ROCKS 范式优化 Agent 质量；需求与 Backlog 描述对齐。 |
| 2026-10-19 | 统一对外 MCP 工具名：`query_hcp`、`list_hcp`、`add_hcp`、`get_hcp_insights`、`propose_engagement_options`、`precheck_compliance`（替换 get_hcp_twin / list_hcp_twins / create_hcp_twin / compliance_precheck）。 |
| 2026-10-19 | 新增 MCP2-06 list_hcp_twins、AGT2-01 Agent 优化；对外 MCP 能力与工具名对齐（get_hcp_twin 等）。 |
| 2026-10-19 | 用户确认后写入 Product Backlog 表格：6 条 PBI，Size 均为 Implementable，Sprint 均为 —。 |
| 2026-10-19 | 按确认调整需求：去掉调用方准入；更新改为后台定时任务 TWIN2-01，不列入对外服务；其余五条对外能力保留。 |
| 2026-10-19 | 写入 2.0 需求列表首版。 |

[返回目录](#index)
