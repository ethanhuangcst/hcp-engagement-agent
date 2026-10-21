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
| Sprint 2 | WIP | 2026-10-20 开工：feature-05、feature-06、feature-01（get_hcp_insights）已 Done；其余三条 ToDo |

## 当前进展

- 当前在做的 sprint：Sprint 2（WIP）。feature-01 `get_hcp_insights` 已于 2026-10-21 关闭（契约 42/42、朱同玉实调、close confirm）。
- 当前在做的 SBI：feature-11 add_hcp 入库科室校验与预灌映射预览（WIP，2026-10-21 开工；[MCP2-09](product-backlog.md#pb-14) / [US-MCP2-007](mcp2.0/mcp2-stories.md) / mcp2-design §13，四层实现：medical-kb 明细视图 → twin-mcp 来源标注 → engagement-mcp 契约 → Web 确认页）。feature-09 受控学科目录扩充与学术索引批量种子实现完成等 close confirm；feature-02 `retrieve_academic` 与 feature-07 知识覆盖对齐实现完成，close confirm 一并确认。
- feature-10 修复（DEF-003 / DEF-004，[MKB2-04](product-backlog.md#pb-15)）：实现与验收完成（全仓 260 测试绿、恢复演练 44 秒、28/28 盘-vs-库相等、重跑幂等、王拥军 retrieve_academic 复验 5 条），WIP 等 close confirm。
- feature-11（MCP2-09 / DEF-005，[pb-14](product-backlog.md#pb-14)，ToDo，2026-10-21 排入）：add_hcp 入库科室校验与预灌映射预览。开工准备完成：规格三模块 13 处写入（mcp / mcp2.0 / app 相互引用一致），实现待开工；feature-02 / 07 close 前置。
- Sprint 排期：2026-10-20 用户确认 Option A，Sprint 3 并入 Sprint 2。

## 下一步可选

- Sprint 2 剩余：`retrieve_compliance`（feature-04）、`ingest_academic`（feature-08）、Agent ROCKS（feature-03）、科室校验与映射预览（feature-11）。

## 当前 OGT（进行中任务）

| # | 任务名称 | 影响的 SBI | Created | Status |
| --- | --- | --- | --- | --- |
| 1 | retrieve_academic 低命中 coverage 信号与建议 ingest 落地（[ADR-014](../../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)；对应 [MCP2-07](product-backlog.md#pb-10) / [MCP2-08](product-backlog.md#pb-11)） | feature-02（MCP2-04） | 2026-10-21 | - |

## 最近关闭的 15 项 OGT

| # | 任务名称 | 影响的 SBI | Created | Closed |
| --- | --- | --- | --- | --- |
| 1 | 单一 env 配置文件（`.env.local`）与 `loadRootEnv` 6 处复制收敛到 `@hca/db` | - | 2026-10-20 | 2026-10-20 |
| 2 | 扩展 `query_hcp` 库外检索（并入式）、医院/科室包含匹配与 `add_hcp` candidate 校验 | Sprint 1 `feature-03`（并重开 `feature-01` 契约扩展） | 2026-10-20 | 2026-10-20 |
| 3 | 解决 RID-1：建立 `specs/.secrets` 并实机核对生产配置（SSH 野草云3） | - | 2026-10-19 | 2026-10-19 |

最后更新：2026-10-21 DEF-005 开工准备完成：MCP2-09 规格三模块写入（mcp2-design §13 / US-MCP2-007 / mcp2-test §14 / F-MCP-012 增补 / F-WEB-047 等 13 处），排入 Sprint 2 为 feature-11（ToDo）；feature-02 / 07 / 09 / 10 实现完成，close confirm 用户暂缓
