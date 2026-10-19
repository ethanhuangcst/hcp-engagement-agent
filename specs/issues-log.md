# 缺陷记录（HCP Engagement Assistant）

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-19
> [Definition](../.cursor/templates/framework.sdd.works/sdd-scrum-practices.md#issues-logmd)

---

## 未关闭缺陷

| Id | Title | Component | Priority | Description | Related | Close Check | Status | Added time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## 已关闭缺陷

| Id | Title | Component | Priority | Description | Related | Close Check | Closed Sprint | Closed time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEF-001 | @hca/db 仍用 pg，MySQL 下 query_hcp 失败 | @hca/db · mcp2.0 · web BFF | P0 | 已切 `mysql2` 与 MySQL 方言；MCP `query_hcp` 与 Web BFF 共用 `@hca/db` 可连生产形 `DATABASE_URL`。 | [db-design](db/db-design.md) · ADR-005 · Sprint 1 `feature-01` | 两包测试绿；MCP 按姓名命中；无运行时 pg | Sprint 1 | 2026-10-19 |
