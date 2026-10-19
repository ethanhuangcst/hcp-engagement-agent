# 对外 MCP 2.0 用户故事与验收标准（ATDD）

> as_of：2026-10-19  
> 依据：[product-backlog.md](../product-backlog.md#external-service)、[mcp2-design.md](./mcp2-design.md)  
> 角色：**MCP 调用方**（集成工程师 / 宿主 Agent）  
> 样例 HCP：朱同玉 fixture（与 [7.test-strategy.md](../spec1.0/7.test-strategy.md) 一致）

## 文档约定

| 项 | 说明 |
| --- | --- |
| 故事编号 | `US-MCP2-NNN` |
| 完成定义 | 本文件 AC + [mcp2-test.md](./mcp2-test.md) + `sdd-dod.mdc` |
| 批次 | Sprint 1–3，对齐 sprint-backlog Feature SBI |

---

## US-MCP2-001 进程骨架与三工具注册（Sprint 1）

**As a** MCP 调用方  
**I want to** 连接对外 MCP 并发现 `list_hcp`、`query_hcp`、`add_hcp`  
**So that** 可在无 Web UI 下维护 HCP 主数据  

**覆盖**：Sprint 1 `task-01`、`feature-01`–`feature-03`

### 验收标准

```gherkin
Feature: MCP 2.0 壳与 Sprint 1 工具

  Scenario: 工具列表含主数据三工具
    Given 对外 MCP 进程已按文档启动
    When 调用方列出 tools
    Then 包含 list_hcp、query_hcp、add_hcp
    And 各 tool 的 inputSchema 与 product-backlog 参数说明一致

  Scenario: list_hcp 返回全量已保存列表
    Given 库中存在至少一条已保存 HCP 且不含 _agent_general
    When 调用 list_hcp
    Then 返回 count 与 items 且 items 含 hcp_id 与列表字段

  Scenario: query_hcp 多条命中
    Given 库中存在同名或可匹配的多条记录
    When 调用 query_hcp 仅传 name
    Then 返回 count 大于 1 且 items 长度等于 count
```

---

## US-MCP2-002 洞察与一人一策（Sprint 2）

**覆盖**：`get_hcp_insights`、`propose_engagement_options` · AGT2-01 同批验收

```gherkin
  Scenario: get_hcp_insights 返回 doing_now
    Given 目标 hcp_id 已有 twin 与 insights
    When 调用 get_hcp_insights
    Then 返回 twin 与 insights 且 doing_now.summary 非空

  Scenario: propose 生成 3 到 5 条方案
    Given 目标 HCP 洞察与机会满足 Agent 最低输入
    When 调用 propose_engagement_options
    Then 返回 run_id 与 3 到 5 条 options 且含 academic_refs 与 compliance_refs
```

---

## US-MCP2-003 合规预审（Sprint 3）

**覆盖**：`precheck_compliance`

```gherkin
  Scenario: 预审更新 gate_result
    Given 已有 option_run_id 与方案
    When 调用 precheck_compliance
    Then gate_result.status 为 pass、conditional 或 reject 之一
    And 响应含 disclaimer 且不含 MLR 替代声明
```
