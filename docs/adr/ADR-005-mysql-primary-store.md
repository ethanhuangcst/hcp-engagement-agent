# ADR-005: 运行时主库改为 MySQL

## 状态
已采纳

## 背景
MVP 初期结构化数据落在托管 Postgres。运维侧要求主库迁到可访问的 MySQL 实例（并经历过一次换主机）。架构文档多处仍写 Postgres；若不统一客户端与迁移路径，BFF / MCP / Agent / medical-kb 会出现方言分裂或双写。

## 决策
1. **唯一运行时主库**：`DATABASE_URL` 必须为 `mysql://…`（或 `mysqls://`）；`@hca/db` 仅用 `mysql2`。
2. **向量仍外置**：Twin / Insights / Options / 会话 / ingest manifest 进 MySQL；向量仍在 Qdrant。
3. **方言约定**：占位符用 `?`；冲突写用 `INSERT … AS new ON DUPLICATE KEY UPDATE`（需 MySQL 8 / 兼容 MariaDB）。
4. **存量路径**：提供 `db:migrate`（建表）、`db:migrate:pg-to-mysql`（首次从 Postgres）、`db:migrate:mysql-to-mysql`（换主机）；密码与主机只写本机 `.env`，不进 Git。
5. **连接韧性**：较长 `connectTimeout`、keep-alive、URL 变更时重建 pool；`.env` 覆盖 shell 中残留的 `postgresql://`。

## 原因
- 主机可达性与运维约束优先于继续绑 Postgres 驱动。
- 共享 `@hca/db` 比各包各自切驱动更能避免半迁移。
- 一次性数据拷贝脚本可验收行数对账，比长期双写简单。

## 后果
- 架构 / 安装文档中「Postgres」叙述需逐步改为 MySQL（部署真相以 `specs/9.deploy.md` 为准）。
- JSON 列由 mysql2 `typeCast` 解出对象；调用方不可假设 `pg` 的 `$1` 语法。
- 旧 Postgres 仅作迁移源，不再作为运行时依赖。
- 远程 MySQL 密码含 `@` 等字符时必须 URL 编码；全角符号会导致认证失败。

## 日期
2026-07-22
