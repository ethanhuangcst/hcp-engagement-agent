# @hca/db 测试计划 — MySQL 对齐（DEF-001）

> as_of：2026-10-19  
> 设计：[db-design.md](./db-design.md) · 故事：[db-stories.md](./db-stories.md)  
> 基线：`common-test-strategy`（更严者胜）

## 1. 范围

| 层 | 对象 | 说明 |
| --- | --- | --- |
| 单元 | `nameMatches`、`filtersMatch` | 保持纯函数；无 DB |
| 单元 | `client` pool 重建、URL 解析 | mock mysql2 或注入 fake pool |
| 集成 | `queryTwins`、`getTwin`、`listTwins` | mysql2 mock 返回行 + JSON 字符串/对象，或 opt-in 测试库 |
| 契约 | `hcp-engagement-mcp` `query_hcp` | 注入 `queryTwins` 仍保留；加一条 opt-in live 说明 |

**非范围**：Postgres 迁移脚本执行测试；生产库写入。

## 2. 环境与数据

- 默认 CI：`mysql2` mock + 与现 `twins.test.ts` 相同 fixture 行。
- Opt-in：`DATABASE_URL` 指向隔离 MySQL；禁止生产 URL。
- 回归姓名：`韩雅玲` 或 synthetic twin（与 7.test-strategy 朱同玉 fixture 并存）。

## 3. 用例表

| 层 | should 命名 | 通过 | 失败 |
| --- | --- | --- | --- |
| 单元 | `nameMatches` 拼音/英文 | 已有用例保持绿 | 空 name |
| 集成 | `queryTwins` by name | 返回 items | `found false` 未知 id |
| 集成 | `getPool` with mysql URL | `createPool` 被调用 | 缺 DATABASE_URL 抛错 |
| MCP | `query_hcp` NOT_FOUND | mock | 已有 |
| 手工 | live `query_hcp` 韩雅玲 | count ≥ 1 | 超时 / INTERNAL_ERROR |

## 4. 命令

```bash
npm run build -w @hca/db
npm run test -w @hca/db
npm run test -w @hca/hcp-engagement-mcp
npm run typecheck -w @hca/db -w @hca/hcp-engagement-mcp
```

## 5. 完成定义（DEF-001 关闭）

- [ ] `@hca/db` 无运行时 `pg` 依赖。
- [ ] 上表集成层在 CI 默认 job 绿。
- [ ] 本地 MCP `query_hcp`（韩雅玲）通过（用户可确认）。
- [ ] [issues-log.md](../issues-log.md) DEF-001 Close Check 满足。
