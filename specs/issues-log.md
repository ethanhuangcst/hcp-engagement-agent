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
| DEF-002 | medical-kb 仍用 Postgres 方言 SQL，MySQL 下 ingest 任务与 manifest 写入失败 | medical-kb · @hca/db | P1 | 已按方案 A 原地改 MySQL 方言（`?` 占位、`ON DUPLICATE KEY UPDATE` 行别名、INSERT 后回读代 RETURNING、error JSON 容错解析）；live 用例真跑 MySQL 验证 upsert 与 jobs 路径。 | [db-design](db/db-design.md) · DEF-001 · [MKB2-01](product-backlog.md#pb-9) · Sprint 2 `feature-05` 发现 | medical-kb SQL 全部改 MySQL 方言；`npm run typecheck -w @hca/medical-kb` 绿；medical-kb 测试 24/24 绿（[rag-tests.md](rag/rag-tests.md)） | Sprint 2 | 2026-10-20 |
| DEF-001 | @hca/db 仍用 pg，MySQL 下 query_hcp 失败 | @hca/db · mcp2.0 · web BFF | P0 | 已切 `mysql2` 与 MySQL 方言；MCP `query_hcp` 与 Web BFF 共用 `@hca/db` 可连生产形 `DATABASE_URL`。 | [db-design](db/db-design.md) · ADR-005 · Sprint 1 `feature-01` | 两包测试绿；MCP 按姓名命中；无运行时 pg | Sprint 1 | 2026-10-19 |
