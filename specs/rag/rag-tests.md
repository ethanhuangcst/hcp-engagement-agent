# medical-knowledge-base — 测试策略与计划

> as_of：2026-10-20（首版：DEF-002 元数据层 MySQL 方言修复，US-RAG-006 / MKB2-01）

**Area:** medical-kb 元数据层（`rag_ingest_jobs` / `ingest_manifest` 读写）
**Stories:** [rag-stories.md](./rag-stories.md) · Design: [rag-design.md](./rag-design.md) §11
**Quality bar:** extends **common-test-strategy** — critical path 100%，overall ≥80% where measurable。基线 [spec1.0/7.test-strategy.md](../spec1.0/7.test-strategy.md)（更严者胜）。

## 1. 范围（US-RAG-006 增量）

| 层 | 对象 | 默认 CI | Live opt-in |
| --- | --- | --- | --- |
| 单元 | jobs 五函数（方言、写后回读、IN 过滤、JSON 往返）、两个 manifest upsert 的 SQL 形状 | Always | — |
| 集成 | 生产形 `DATABASE_URL` 下 seed manifest 一条写读往返 | — | opt-in |
| E2E | 无浏览器层（本故事无 UI） | — | 实机灌库旅程走 [release.md](../release.md) 冒烟，opt-in |

**Principles**

- 池一律 mock（照 `@hca/db` `twins.test.ts` 的 mock `getPool` 模式），默认 CI 零外网、零生产库。
- SQL 断言形状与参数顺序，不断言数据库执行计划。
- 接口签名与返回形状回归：修复前后行为零变化。

## 2. 单元测试

| 模块 | 通过 | 失败或空 |
| --- | --- | --- |
| `jobs.ts` | 五函数 SQL 均为 `?` 占位；`findInProgressJob` 用 `IN (?, ?)` 且参数顺序正确；`createJob` / `updateJob` 写后按 job_id 回读；参数数组与占位符数量一致 | 回读未命中返回 `null` 而非抛错；`error` 写入传 JSON 字符串、读出经解析还原；非法 JSON 不产生未捕获异常 |
| `api.ts` `upsertManifest` | SQL 含 `ON DUPLICATE KEY UPDATE` 与行别名，无 `$n` / `::date` / `ON CONFLICT` | upsert 参数缺失字段时照旧走既有校验路径 |
| `academic.ts` `upsertAcademicManifest` | 同上 | 同上 |

## 3. 集成测试

| 区域 | 通过 | 失败或空 |
| --- | --- | --- |
| 生产形 MySQL（opt-in） | `seed_compliance` 写一条 manifest 后 `get_ingest_status` 可读回，`updated_at` 变化 | 重复执行同版本结果稳定（幂等） |

## 4. E2E

无。本故事无用户界面；实机验证列入 release.md 冒烟。

## 命令

```bash
npm run test -w @hca/medical-kb
npm run typecheck -w @hca/medical-kb
```
