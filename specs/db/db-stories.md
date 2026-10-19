# @hca/db 用户故事（MySQL 对齐）

> as_of：2026-10-19  
> 缺陷：**DEF-001** · 设计：[db-design.md](./db-design.md)  
> 基线：`common-test-strategy` · [7.test-strategy.md](../spec1.0/7.test-strategy.md)

---

## US-DB-001 运行时仅用 mysql2 访问主库（DEF-001）

**As a** MCP 调用方  
**I want to** `query_hcp` 与 Web 共用 `@hca/db` 且 `DATABASE_URL` 为 MySQL 时能稳定返回结果  
**So that** feature-01 在 Cursor 与 CI 中行为一致，而不依赖手工 mysql2 脚本  

**Related**：Sprint 1 `feature-01` · ADR-005 · US-MCP2-004

### 验收标准

```gherkin
Feature: @hca/db MySQL runtime

  Scenario: queryTwins 连 MySQL 按姓名命中
    Given 进程已加载 DATABASE_URL 且指向 MySQL hca 库
    And 库中已保存医生「韩雅玲」且 hcp_id 不是 _agent_general
    When 调用 queryTwins 仅传 name 为「韩雅玲」
    Then 返回 found 为 true
    And count 大于等于 1
    And items 中每条通过 VirtualTwin 校验

  Scenario: MCP query_hcp 端到端
    Given hcp-engagement-mcp 已启动并加载同一 DATABASE_URL
    When 调用方对 query_hcp 传入 name「韩雅玲」
    Then 30 秒内返回 count 与 items
    And 无 INTERNAL_ERROR
    And 响应正文不含 stack 与连接串

  Scenario: 单元测试不依赖 pg 假装通过
    Given CI 运行 npm run test -w @hca/db
    Then 套件使用 mysql2 mock 或隔离 MySQL fixture
    And 不存在仅 mock pg 而掩盖 mysql 方言的用例
```
