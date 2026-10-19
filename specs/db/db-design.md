# @hca/db 技术设计 — MySQL 运行时对齐（ADR-005）

> as_of：2026-10-19  
> 缺陷：[issues-log.md](../issues-log.md) **DEF-001**  
> 决策：[ADR-005](../../docs/adr/ADR-005-mysql-primary-store.md)  
> 阻塞 SBI：Sprint 1 `feature-01` · [mcp2-design.md §6](../mcp2.0/mcp2-design.md)

## 1. 问题

| 现象 | 根因 |
| --- | --- |
| Cursor `query_hcp` 超时或 `INTERNAL_ERROR` | `@hca/db` 仍用 `pg.Pool` + `$n` / `::jsonb` / `ON CONFLICT`，与 `DATABASE_URL=mysql://…` 不兼容 |
| Web BFF twin 读写路由同样失败 | `/api/twins*` 直调 `@hca/db` 同一组函数（`listTwins` / `getTwin` / `updateTwinIdentity` / `deleteTwin` / insights） |
| Vitest 绿、真库失败 | 单测 mock `pg`，未覆盖 mysql2 与 MySQL 方言 |
| `db:migrate` 与生产库不一致 | `packages/db/migrations/*.sql` 为 Postgres 语法；生产 MySQL 已由运维建表 |

**已验证**：同 `DATABASE_URL` 下用 `mysql2` 按姓名可查到「韩雅玲」（`hcp_a5123103389`）。

## 2. 目标架构

```text
@hca/hcp-engagement-mcp handler
        │
        ▼
@hca/db  twins | engagement | migrate
        │
        ▼
mysql2/promise Pool（唯一驱动，ADR-005）
        │
        ▼
MySQL 8（hca · hcp_twins 等）
```

| 组件 | 变更 |
| --- | --- |
| `packages/db/src/client.ts` | `mysql2/promise`；`connectTimeout`、keep-alive；`dateStrings: true` 保持 `as_of` 为字符串；URL 变更时重建 pool |
| `packages/db/package.json` | 依赖 `mysql2`；移除运行时 `pg` 与 `@types/pg` |
| `packages/db/src/twins.ts` | `?` 占位；写 JSON 列直接绑定 JSON 字符串（MySQL 隐式转换，不用 `CAST`）；`INSERT … AS new ON DUPLICATE KEY UPDATE`；列表 SQL 用 MySQL JSON 函数（`JSON_EXTRACT` / `JSON_UNQUOTE` / `JSON_TYPE`）替代 `jsonb_typeof` |
| `packages/db/src/engagement.ts` | 同上方言 |
| `packages/db/src/migrate.ts` | 仅执行 `migrations/mysql/*.sql`（新建，`CREATE TABLE IF NOT EXISTS` 含内联索引，幂等）；Postgres 脚本保留作历史，默认 `migrate` 不再执行 |
| 调用点 API | mysql2 `query` 返回 `[rows, fields]` 元组；删除/写操作读 `affectedRows`（替代 `rowCount`） |
| JSON 读取 | `asJson` 兜底：JSON 列返回字符串时 `JSON.parse`，返回对象时直通；接 `VirtualTwinSchema.parse` |

## 3. SQL 方言对照（实现检查表）

| Postgres（现状） | MySQL（目标） |
| --- | --- |
| `$1, $2` | `?, ?` |
| `$n::jsonb` | 直接绑定 JSON 字符串（MySQL 隐式转换） |
| `ON CONFLICT (hcp_id) DO UPDATE` | `ON DUPLICATE KEY UPDATE` |
| `JSONB` 列类型 | `JSON` |
| `jsonb_typeof(x) = 'string'` | `JSON_TYPE(x) = 'STRING'` 或应用层解析 |
| `NOW()` | `NOW()`（保留） |
| `RETURNING` | 需要时用二次 `SELECT` 或 `INSERT` + `SELECT` |

## 4. 测试与验收

- 见 [db-tests.md](./db-tests.md)。
- 修复后门禁：`npm run test -w @hca/db`、`npm run test -w @hca/hcp-engagement-mcp`；本地 `query_hcp` + `name=韩雅玲` 在 30s 内返回 `count >= 1`（需 `.env.local` 中 `DATABASE_URL`）。

## 5. 范围外（本修复不做）

- Postgres → MySQL 全量数据迁移脚本（ADR-005 已有命令名，另开故事）。
- 改 Web BFF 路由逻辑。
- `list_hcp` / `add_hcp` 实现（仍属 feature-02/03）。
- `loadRootEnv` 约 6 处复制的收敛（另开小任务；本修复不扩散）。
- Web 500/502 直接回 `err.message` 的净化（P2，另开小任务）。

## 6. 风险

| 风险 | 缓解 |
| --- | --- |
| 远程 MySQL 延迟 | ADR-005 连接超时与 pool 重建 |
| 密码含 `@` | URL 编码；`.env.local` 已用 `%40%40` |
| 半迁移（仅 twins 改方言） | 同一 PR 内 twins + engagement + client + migrate 路径一并改 |
