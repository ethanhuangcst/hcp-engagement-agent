# 产品概览 — HCP Engagement Assistant

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-19

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

- 2.0 让调用方不打开网页，也能完成网页上的医生数字分身列表、查询与新增、洞察、一人一策和合规预审。
- 对外 MCP 工具名统一为 `list_hcp`、`query_hcp`、`add_hcp`、`get_hcp_insights`、`propose_engagement_options`、`precheck_compliance`，与产品能力一一对应。
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
  - **做什么**：在已保存医生中按条件查找；命中几位就返回几位。
  - **Annotations**：只读（`readOnlyHint: true`）。
  - **参数**（可组合；至少传 `hcp_id` 或 `name` 之一）：
    - `hcp_id`：系统编号；存在则只查这一位（仍放在 `items` 数组里）。
    - `name`：姓名，中文或拼音均可。
    - `hospital`、`department`、`city`：均可选，用于缩小范围。
  - **返回**：`{ count, items[] }`；每条为完整数字分身及可选 `build.runId`。`count` 为 0 表示无匹配。
  - **失败**：`VALIDATION_ERROR`；指定 `hcp_id` 不存在时为 `NOT_FOUND`。
- <a id="pb-7"></a>[MCP2-06](#pb-7) `list_hcp` · 列出 HCP
  - **做什么**：列出全部已保存医生（与 Web「HCP 列表」同一范围）。
  - **Annotations**：只读（`readOnlyHint: true`）。
  - **参数**：无必填；2.0 **不提供** `limit`、`offset` 分页，一次返回全量。
  - **返回**：`{ count, items[] }`；含 `hcp_id`、姓名、医院、科室、`as_of`、标签、一句话洞察摘要等。
  - **失败**：`INTERNAL_ERROR`。
- <a id="pb-2"></a>[MCP2-02](#pb-2) `add_hcp` · 新增 HCP
  - **做什么**：确认身份后写入库（同 Web「确认并保存」）；不自动开始「构建情报」。
  - **Annotations**：写库；非删除；非幂等。
  - **参数**：`hcp_id`；`name_zh`、`hospital`、`department`；可选 `name_en`、`title`、`city`、`specialties[]`、`themes[]`、`author_ids_draft`、`tags_draft`。
  - **返回**：`{ twin, hcp_id, knowledge_jobs? }`。
  - **失败**：`VALIDATION_ERROR`、`INTERNAL_ERROR`。
- <a id="pb-3"></a>[MCP2-03](#pb-3) `get_hcp_insights` · HCP 洞察
  - **做什么**：读取洞察页数据（一句话洞察及科研、热力、机会等块）。
  - **Annotations**：只读。
  - **参数**：`hcp_id`（必填）。
  - **返回**：`{ twin, insights }`；`doing_now.summary` 为一句话洞察。
  - **失败**：`NOT_FOUND`。
- <a id="pb-4"></a>[MCP2-04](#pb-4) `propose_engagement_options` · 一人一策
  - **做什么**：生成 3～5 条互动方案并写入库；内部检索学术与合规并走 Agent。
  - **Annotations**：写库；依赖检索与 LLM（`openWorldHint: true`）。
  - **参数**：
    - `hcp_id`（必填）。
    - `tenant_id`（可选）：租户 ID；合规检索只拉该租户 SOP；不传则不含客户专属 SOP。
    - `product_context`（可选）：当次产品或推广边界说明，只影响当次生成，不写 Twin。
  - **返回**：`{ run_id, options[], gate_result?, run, llm? }`；每条含动作、渠道、引用等。
  - **失败**：`NOT_FOUND`、`DOING_NOW_INPUT_INSUFFICIENT`、`VALIDATION_ERROR`、`LLM_UNAVAILABLE`。
- <a id="pb-5"></a>[MCP2-05](#pb-5) `precheck_compliance` · 合规预审
  - **做什么**：对某次方案跑合规闸门并更新预审结果；**不代替**正式 MLR。
  - **Annotations**：更新闸门结果；同一 `option_run_id` 可重复调用（幂等）。
  - **参数**：`hcp_id`、`option_run_id`（必填）；`option_id`（可选，只审一条时）。
  - **返回**：`{ status, findings[], gate_result, run, options[] }`；`gate_result.status` 为 `pass`、`conditional` 或 `reject`。
  - **失败**：`NOT_FOUND`、`VALIDATION_ERROR`。


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
| 2 | 对外服务 | [MCP2-06](#pb-7) | list_hcp · 列出 HCP | Implementable | - [Web 分身列表](app/app-function-spec.md)<br>- [对内 listTwins](mcp/mcp-function-spec.md) | Sprint 1 | ToDo |
| 3 | 对外服务 | [MCP2-02](#pb-2) | add_hcp · 新增 HCP | Implementable | - [Web 确认保存](app/app-function-spec.md)<br>- [对内 confirm_and_save_twin](mcp/mcp-function-spec.md) | Sprint 1 | ToDo |
| 4 | 对外服务 | [MCP2-03](#pb-3) | get_hcp_insights · HCP 洞察 | Implementable | - [Agent 洞察与 doing_now](agent/agent-function-spec.md)<br>- [Web 洞察页](app/app-function-spec.md) | Sprint 2 | ToDo |
| 5 | 对外服务 | [MCP2-04](#pb-4) | propose_engagement_options · 一人一策 | Implementable | - [Agent proposeOptions](agent/agent-function-spec.md)<br>- [Web 一人一策](app/app-function-spec.md) | Sprint 2 | ToDo |
| 6 | 对外服务 | [MCP2-05](#pb-5) | precheck_compliance · 合规预审 | Implementable | - [Agent 合规闸门](agent/agent-function-spec.md)<br>- [Web 合规检查](app/app-function-spec.md) | Sprint 3 | ToDo |
| 7 | 后台维护 | [TWIN2-01](#pb-6) | 定时自动更新数字分身 | Implementable | - [对内 build_twin](mcp/mcp-function-spec.md)<br>- [安装与运行 §11](spec1.0/4.install-dependencies.md) | Sprint 3 | ToDo |
| 8 | Agent | [AGT2-01](#pb-8) | Agent 优化 · ROCKS 范式 | Implementable | - [Agent 功能规格](agent/agent-function-spec.md)<br>- [Agent 设计](agent/agent-design.md) | Sprint 2 | ToDo |

[返回目录](#index)

---

<a id="change-record"></a>

# 变更记录

| Date | Change |
| --- | --- |
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
