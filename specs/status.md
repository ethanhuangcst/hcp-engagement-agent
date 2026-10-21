# HCP Engagement Assistant 最新状态

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-21
> [Definition](../.cursor/templates/framework.sdd.works/sdd-scrum-practices.md#statusmd)

---

## 项目进度

| 里程碑 | Status |
| --- | --- |
| 项目启动 | WIP |
| 产品 backlog 初稿完成 | Done |

| Sprint | Status | Note |
| --- | --- | --- |
| Sprint 1 | Done | 2026-10-20 关闭：task-01、feature-01（含 OGT-1 扩展）、feature-02、feature-03 均 Done，Sprint Goal 经用户确认达成 |
| Sprint 2 | WIP | 2026-10-20 开工：feature-01 / 02 / 05 / 06 / 07 / 09 / 10 / 11 / 12 / 13 共十条 Done；剩 feature-03 / 04 / 08 三条 ToDo |

## 当前进展

- 当前在做的 sprint：Sprint 2（WIP）。feature-13（MKB2-03 合规 coverage 与版本治理）已于 2026-10-21 经用户 close confirm 关闭；PBI MKB2-03 置 Done。
- 当前在做的 SBI：feature-08 `ingest_academic` / `get_ingest_status`（MCP2-08，ADR-014 决策 3；开工准备完成：mcp2-design §14、US-MCP2-008、mcp2-test §16 已于 2026-10-21 写入，用户确认开工）。
- 合规索引后台检查：`coverage.status=ready`（rdpac 15、cn_med_rep_measures 8）；已删除 Qdrant 孤儿点 `tenant-demo@2026-01`。
- OGT-5（2026-10-21 创建）：生产 RAG 向量回灌**已执行**。G1–G3 通过：生产 Qdrant academic 146 / compliance 23 点，与语料、manifest 三面一致，零测试残留（隧道窗口期混入的 1 个 tenant-demo 测试点已删除）；G4 冒烟待 Portainer 部署后执行。执行记录与 DEF-005（seed-compliance 空库自锁）见 [data-backfill-design.md](./go-live/1021/data-backfill-design.md)。
- B+ 专科信号增强已随 feature-11 / feature-12 关闭：OpenAlex 论文级 concepts 归一科室信号、卡片主题词与科室判断、mismatch 确认闸门（`confirm_department_checked`）、无信号阻断（`DEPARTMENT_SIGNAL_MISSING`）；侯凡凡 / 叶定伟 live 验收通过，知识条目见 [openalex-department-signal-works-concepts.md](./knowledge/data/openalex-department-signal-works-concepts.md)。
- Sprint 排期：2026-10-20 用户确认 Option A，Sprint 3 并入 Sprint 2。

## 下一步可选

- Sprint 2 剩余：Agent ROCKS（feature-03）、`retrieve_compliance`（feature-04）、`ingest_academic`（feature-08）。
- 候选新故事：医院中英文名归一（回顾 Opportunities #4：中文「南方医院」查不到库内 `Nanfang Hospital`）。

## 当前 OGT（进行中任务）

| # | 任务名称 | 影响的 SBI | Created | Status |
| --- | --- | --- | --- | --- |
| 5 | 生产 RAG 向量数据回灌：生产节点 Qdrant 空集合，经 SSH 隧道以受控语料规范重灌（方案 A，[data-backfill-design.md](./go-live/1021/data-backfill-design.md)；执行件 = [go-live Phase 3](./go-live/1021/go-live-instruction.md)） | feature-02 / feature-08（MCP2-07/08 生产数据面） | 2026-10-21 | WIP |

## 最近关闭的 15 项 OGT

| # | 任务名称 | 影响的 SBI | Created | Closed |
| --- | --- | --- | --- | --- |
| 1 | retrieve_academic 低命中 coverage 信号与建议 ingest 落地（[ADR-014](../../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)；对应 [MCP2-07](product-backlog.md#pb-10) / [MCP2-08](product-backlog.md#pb-11)） | feature-02（MCP2-04） | 2026-10-21 | 2026-10-21 |
| 2 | 单一 env 配置文件（`.env.local`）与 `loadRootEnv` 6 处复制收敛到 `@hca/db` | - | 2026-10-20 | 2026-10-20 |
| 3 | 扩展 `query_hcp` 库外检索（并入式）、医院/科室包含匹配与 `add_hcp` candidate 校验 | Sprint 1 `feature-03`（并重开 `feature-01` 契约扩展） | 2026-10-20 | 2026-10-20 |
| 4 | 解决 RID-1：建立 `specs/.secrets` 并实机核对生产配置（SSH 野草云3） | - | 2026-10-19 | 2026-10-19 |

最后更新：2026-10-21 OGT-5 生产 RAG 向量回灌执行完毕（G1–G3 通过，146/23 三面一致；G4 待部署）；feature-13 / MKB2-03 保持 Done；Sprint 2 保持 WIP（剩 feature-03 / 04 / 08）。
