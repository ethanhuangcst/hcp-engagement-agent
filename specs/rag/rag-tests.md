# medical-knowledge-base — 测试策略与计划

> as_of：2026-10-21（新增 US-RAG-007：受控学科目录扩充与学术索引批量种子，MKB2-02 / feature-09；US-RAG-008：合规覆盖信号与条款版本治理，MKB2-03；§7 US-RAG-009：学术索引写入与恢复健壮性修复，DEF-003 / DEF-004）

**Area:** medical-kb 元数据层（US-RAG-006）+ 受控学科目录与批量种子（US-RAG-007）+ 合规覆盖与版本治理（US-RAG-008）
**Stories:** [rag-stories.md](./rag-stories.md) · Design: [rag-design.md](./rag-design.md) §11、§18、§19
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

## 5. US-RAG-007 增量（受控学科目录扩充与批量种子）

范围：

| 层 | 对象 | 默认 CI | Live opt-in |
| --- | --- | --- | --- |
| 单元 | `specialty.ts` 扩充后归一化（新学科键 / 中英文别名 / 未收录仍抛 `SPECIALTY_UNRESOLVED`）；`resolveSpecialtiesForIngest` 新科室正则（神经病学 / 神经内科 → neurology）；批量脚本降级与重跑逻辑（mock `ingestOnDemand`） | Always | — |
| 集成 | 批量脚本对本地 Qdrant + MySQL 跑一轮小样本（2-3 学科），`coverageCheck` 全 ready | — | opt-in |
| E2E | 无 UI；实机冒烟：批量种子全量跑 + 王拥军 `retrieve_academic` 神经内科真实命中（经 :3300 tools/call） | — | opt-in |

单元用例（happy / failure）：

| 模块 | 通过 | 失败或空 |
| --- | --- | --- |
| `specialty.ts` | 新学科键与中英文别名均归一化到受控键（neurology 首个案例）；全学科清单逐键可归一化 | 未收录别名抛 `SPECIALTY_UNRESOLVED`；空串抛错 |
| `ingest-trigger.ts` | department 神经病学 / 神经内科解析出 `neurology`；既有肾移植 / 噬菌体 / 唐氏正则不回归 | 非受控科室仍返回空数组 |
| 批量种子脚本 | 逐学科调 `ingestOnDemand`，ready 学科幂等跳过；单学科抛错降级 fixture 并继续；全部源失败记结构化日志跳过 | 重跑仅补未 ready 学科 |

集成与实机命令（opt-in，沿用 US-RAG-006 命令加批量脚本）：

```bash
npm run test -w @hca/medical-kb
npm run typecheck -w @hca/medical-kb
```

## 6. US-RAG-008 增量（合规覆盖信号与条款版本治理，MKB2-03）

范围（排入 sprint 后执行）：

| 层 | 对象 | 默认 CI | Live opt-in |
| --- | --- | --- | --- |
| 单元 | coverage 聚合（manifest 行 → authorities 清单与 chunk 数）；sparse `repair_hint`；版本下线逻辑（mock Qdrant upsert/delete 断言按 (authority, 旧 version) 删除）；`RagChunk` 合规字段不变项回归 | Always | — |
| 集成 | 本地 Qdrant + MySQL：灌 2024-01 命中 → 灌假想 2026-01 后旧条款不返回；`coverage` 与 manifest 回读一致 | — | opt-in |
| E2E | 无 UI；实机冒烟：扩充后种子抽检命中含 `clause_id`（`seed_compliance` 后检索） | — | opt-in |

单元用例（happy / failure）：

| 模块 | 通过 | 失败或空 |
| --- | --- | --- |
| coverage 聚合 | 多 authority manifest 聚合出各 chunk 数与最新 `as_of`；检索响应含 `coverage` 且与 manifest 一致 | manifest 读取失败时响应省略 `coverage` 且不报错 |
| 版本治理 | 同 `authority` 灌新版本后按 (authority, 旧 version) 删除旧 point；重跑幂等 | 删除失败记结构化错误，不写半状态 |
| 稀疏信号 | manifest 无任何 authority 行时 `coverage.status` 为 sparse 且附 `repair_hint` | 有 authority 行时无 sparse 标记，近邻照常返回 |
| 种子扩充 | `rdpac` ≥15、`cn_med_rep_measures` ≥8 且逐行过 Zod schema | 行缺 `clause_id` 或 `version` 时灌库失败并指出行号 |

集成与实机命令（opt-in，沿用既有命令）：

```bash
npm run test -w @hca/medical-kb
npm run typecheck -w @hca/medical-kb
npm run seed:compliance -w @hca/medical-kb
```

## 7. US-RAG-009 增量（学术索引写入与恢复健壮性修复，DEF-003 / DEF-004）

范围：

| 层 | 对象 | 默认 CI | Live opt-in |
| --- | --- | --- | --- |
| 单元 | `academicPointId` 导出后同 PMID 跨学科 ID 不同；`health()` 探测读（mock Qdrant search 抛 500 / panic → `ok: false` 附错误细节）；seed CLI 信号陷阱（mock SIGTERM / SIGINT 等待当前学科 job 终态再退出）；三处 scroll 断言传 point-ID 游标（非 offset） | Always | — |
| 集成 | 本地 Qdrant：两学科语料含同一 PMID 依序灌入，双方 coverage 不减；清 `academic_index` 全量重灌后 28/28 盘-vs-库逐条相等，重跑全部 `skipped_ready` | — | opt-in |
| E2E | 无 UI；实机：王拥军 `retrieve_academic`（:3300 tools/call）复验 neurology 5 条真实证据；恢复演练计时（清库重灌 ≤5 分钟恢复 28/28 ready） | — | opt-in |

单元用例（happy / failure）：

| 模块 | 通过 | 失败或空 |
| --- | --- | --- |
| `academicPointId` | 同 PMID 在两个 specialty 下生成不同 ID；DOI 与 fixture fallback 同理含 specialty | 无 pmid / doi 时仍走 `${specialty}:${index}:${version}` fallback，不变 |
| health 探测 | 双 collection 各带 filter 1 点探测读成功时 `ok: true` | 探测读 500 / panic 时 `ok: false` 并附错误细节；坏 shard 在 listCollections 正常时仍被探测发现 |
| seed CLI 信号陷阱 | SIGTERM / SIGINT 后等待当前学科 job 终态再退出；已完学科保持 `skipped_ready` | 当前学科中途失败不进入下一学科，无半状态 |
| scroll ID 游标 | `countQdrantSpecialtyChunks` / `loadAcademicPayloadsForBm25` / `loadCompliancePayloadsForBm25` 传上一页最后 point id 作游标 | 响应无 `next_page_offset` 时以 point id 收敛翻页，不依赖 sequential offset |

集成与实机命令（opt-in，沿用既有命令加批量脚本与恢复演练）：

```bash
npm run test -w @hca/medical-kb
npm run typecheck -w @hca/medical-kb
npm run seed:academic-batch -w @hca/medical-kb -- --force --no-fetch
```

## 命令

```bash
npm run test -w @hca/medical-kb
npm run typecheck -w @hca/medical-kb
```
