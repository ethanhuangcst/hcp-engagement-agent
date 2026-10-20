# ADR-012: 对外 MCP 2.0 只暴露数据面

## 状态
已采纳（修订 mcp2-design §3 工具映射与 product-backlog「MCP」清单中的 MCP2-04 / MCP2-05；Sprint 2/3 目标口径随之调整）

## 背景
mcp2-design §3 原规划六个对外工具，含 `propose_engagement_options`（写库 + LLM 生成互动方案）与 `precheck_compliance`（触发合规闸门）。调用方是外部 agent 工具（Cursor / 企业 Agent / workbuddy 等），其 prompt 与文件由调用方掌控，可被修改或注入；服务器无法验证调用方意图与 `product_context` 真实性。

## 决策
1. 对外 MCP 2.0 只暴露数据面：`list_hcp`、`query_hcp`、`add_hcp`、`get_hcp_insights`、`retrieve_academic`、`retrieve_compliance`。
2. `propose_engagement_options` 与 `precheck_compliance` 从工具集移除；方案生成与预审仅经服务器内嵌 agent + Web App。
3. `retrieve_compliance` 的 `tenant_id` 只来自服务端鉴权上下文，不作工具入参；租户鉴权未上线前仅返回全局种子。
4. `retrieve_compliance` 返回条款引用（`clause_id` / `authority` / `version`），工具 description 写明不是预审判定。
5. 外部本地 agent 可基于数据面工具在本地生成方案草稿并做本地预审：方案含双引用、恒标 `mlr_status: draft_not_reviewed`，预审基于条款引用、标注不替代服务器闸门与正式 MLR；不触发服务器决策面副作用。
6. 远程提案若立项：独立 MCP（带鉴权与 tenant 作用域）或 Web App，不复用数据面 MCP。

## 原因
- 受监管内容（方案生成、合规判定）的触发权不能交给 prompt 可被注入的调用方；生成与闸门保留在可信执行环境（服务器内嵌 agent + Web App）。
- 数据面（读证据 + 主数据维护）风险低、价值高，可以放心外露；检索到的带引用证据已足以支撑外部 agent 的本地草拟。
- Agent 包内部五 tool 与包级 API（`proposeOptions`、`runComplianceGate`）不变，仅收敛对外暴露面，改动集中在注册与规格。

## 后果
- 受监管内容的生成与闸门触发保留在可信执行环境；提案主路径「`retrieve_compliance` 不可跳过」的约束不受影响。
- 外部 agent 仍可获得带引用的学术与合规证据，但不能触发服务器侧生成或写库的决策面副作用。
- Agent 包内部五 tool 与包级 API（`proposeOptions`、`runComplianceGate`）不变；仅对外暴露面变化。
- 六工具、三 sprint 容量不变：MCP2-04 → `retrieve_academic`（Sprint 2），MCP2-05 → `retrieve_compliance`（Sprint 3）。
- 两个检索工具的入参、返回与 annotations 在各自 sprint 的设计里定稿（对齐 Agent 内部 I-AGT-007 / I-AGT-008，MCP 层新增租户鉴权钩子位）。

## 日期
2026-10-20