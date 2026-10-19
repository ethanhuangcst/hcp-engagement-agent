# 对外 MCP 2.0 用户故事与验收标准（ATDD）

> as_of：2026-10-19（US-MCP2-004 补逗号、连字符、撇号、行首称谓，以及倒序后的 1 次编辑）  
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

**覆盖**：Sprint 1 `task-01`（`feature-01` 见 US-MCP2-004）

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

  Scenario: 仅 Streamable HTTP 可接入（ADR-008）
    Given 对外 MCP 进程已启动并监听 MCP2_PORT
    When 调用方以 MCP url 方式连接 /mcp
    Then initialize 握手成功且可列出工具
    And GET /health 返回 {ok: true, service: "hcp-engagement-mcp"}
    When 调用方尝试 stdio 子进程方式接入
    Then 无可用接入方式（stdio 已随 ADR-008 从代码移除）
```

---

## US-MCP2-004 按条件查询已保存 HCP（Sprint 1）

**As a** MCP 调用方  
**I want to** 用编号或姓名在已保存医生中查找  
**So that** 命中几位就拿到几位完整数字分身，而不打开 Web  

**覆盖**：Sprint 1 `feature-01` · [MCP2-01](../product-backlog.md#pb-1)

### 验收标准

```gherkin
Feature: query_hcp

  Scenario: 按 hcp_id 返回一位完整分身
    Given 库中已保存该 hcp_id 且不是 _agent_general
    When 调用 query_hcp 并传入该 hcp_id
    Then 返回 count 等于 1
    And items 长度为 1 且含该医生的完整数字分身
    And 响应无密钥、无堆栈、无内网路径

  Scenario: 仅传姓名且多名命中
    Given 库中至少两位已保存医生的中文名、英文名或拼音可被同一 name 命中
    When 调用 query_hcp 仅传 name
    Then 返回 count 大于 1 且 items 长度等于 count
    And 每条为完整数字分身

  Scenario: 姓名加医院缩小范围
    Given 同名医生分属不同医院
    When 调用 query_hcp 传入 name 与其中一家 hospital
    Then items 只含该医院的命中

  Scenario: 英文名名在前仍命中
    Given 已保存医生的英文名或中文名拼音是姓在前
    When 调用 query_hcp 传入名在前的拉丁姓名
    Then 返回 count 大于等于 1
    And items 含该医生的完整数字分身

  Scenario: 逗号写成姓在前仍命中
    Given 已保存医生的英文名或拼音是名在前，例如 Wenhong Zhang
    When 调用 query_hcp 传入 zhang, wenhong
    Then items 含该医生的完整数字分身

  Scenario: 全角逗号与半角逗号同样命中
    Given 已保存医生的英文名或拼音是名在前
    When 调用 query_hcp 传入用全角逗号分开的姓和名
    Then items 含该医生的完整数字分身

  Scenario: 连字符去掉后与英文名相同
    Given 已保存医生的英文名是 Wenhong Zhang
    When 调用 query_hcp 传入 Wen-hong Zhang
    Then items 含该医生的完整数字分身

  Scenario: 撇号去掉后与英文名相同
    Given 已保存医生的英文名在去掉撇号后与查询相同
    When 调用 query_hcp 传入带直撇号或弯撇号的拉丁姓名
    Then items 含该医生的完整数字分身

  Scenario: 行首称谓去掉后命中
    Given 已保存医生的英文名是 Yaling Han
    When 调用 query_hcp 传入 Dr. Yaling Han
    Then items 含该医生的完整数字分身

  Scenario: 逗号形式倒序后差一个字母仍命中
    Given 已保存医生的英文名是 Wenhong Zhang
    When 调用 query_hcp 传入 zhang, wenhon
    Then items 含该医生的完整数字分身

  Scenario: 句点缩写不命中全名
    Given 已保存医生的英文名是 Yaling Han
    When 调用 query_hcp 传入 Y. Han
    Then 不因缩写规则命中该医生

  Scenario: 行尾称谓不去掉
    Given 已保存医生的英文名是 Yaling Han
    When 调用 query_hcp 传入 Yaling Han, MD
    Then 不因称谓规则命中该医生

  Scenario: 逗号后没有第二段时不互换
    Given 库中没有英文名或拼音归一后等于 zhang 的医生
    When 调用 query_hcp 传入 zhang,
    Then 返回 count 等于 0 且 items 为空数组

  Scenario: 拉丁全名差一个字母仍命中
    Given 已保存医生的英文名或拼音在去空格、转小写后长度至少为 6
    When 调用 query_hcp 传入与该全名相差 1 次编辑的拉丁全名
    Then items 含该医生的完整数字分身

  Scenario: 过短拉丁名不做模糊
    Given 库中存在英文名里含有该短串的医生
    And 该短串去空格后少于 6 个字母
    When 调用 query_hcp 仅传该短串
    Then 不因模糊规则命中该医生

  Scenario: 拉丁全名相差两次及以上不命中
    Given 查询在去掉行首称谓、逗号、连字符和撇号之后，与该医生的英文名、拼音相差至少 2 次编辑
    And 词序互换后仍至少相差 2 次编辑
    When 调用 query_hcp 仅传该查询
    Then 返回 count 等于 0 且 items 为空数组
    And 不是错误响应

  Scenario: 无匹配
    Given 库中没有与该 name 匹配的已保存医生
    When 调用 query_hcp 仅传 name
    Then 返回 count 等于 0 且 items 为空数组
    And 不是错误响应

  Scenario: 缺少编号和姓名
    When 调用 query_hcp 且 hcp_id 与 name 都未传
    Then 工具结果为失败
    And 错误码为 VALIDATION_ERROR
    And 响应无堆栈

  Scenario: 指定编号不存在
    Given 该 hcp_id 不在库中，或该编号是 _agent_general
    When 调用 query_hcp 并传入该 hcp_id
    Then 错误码为 NOT_FOUND
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
