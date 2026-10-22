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
| Sprint 2 | WIP | 2026-10-20 开工：feature-01 / 02 / 04 / 05 / 06 / 07 / 08 / 09 / 10 / 11 / 12 / 13 / 14 共十三条 Done；剩 feature-03（Agent ROCKS）一条 |

## 当前进展

- 当前在做的 sprint：Sprint 2（WIP）。当前 WIP SBI：feature-03（Agent ROCKS，AGT2-01，2026-10-21 用户确认开工），规格四件已就位（功能增补 F-AGT-031~034、US-AGT-007/008、agent-design §13、agent-tests），实现进行中。feature-04 / 08 / 14 已于 2026-10-21 关闭，对外 MCP 八工具全齐。
- 回顾 Future action #5 已落地：[release.md](release.md) Step 5 补「live 临时脚本放仓库根 `.tmp-*.mts`」，`.gitignore` 补 `.tmp-*`（feature-08 验收批次）。
- 合规索引后台检查：`coverage.status=ready`（rdpac 15、cn_med_rep_measures 8）；已删除 Qdrant 孤儿点 `tenant-demo@2026-01`。
- OGT-5（2026-10-21 关闭）：生产 RAG 向量回灌完成。G1–G3 通过：生产 Qdrant academic 146 / compliance 23 点，与语料、manifest 三面一致，零测试残留；G4 冒烟待 Portainer 部署后执行（保留在 [go-live Phase 6 S4](./go-live/1021/go-live-instruction.md)）。执行记录见 [data-backfill-design.md](./go-live/1021/data-backfill-design.md)。
- DEF-007（2026-10-21 关闭）：seed-compliance 预检顺序自锁已修复（feature-14：main 改 ensure → health → seed，空库自举实机验证通过，本机数据 146/24 完好），见 [issues-log](issues-log.md)。
- B+ 专科信号增强已随 feature-11 / feature-12 关闭：OpenAlex 论文级 concepts 归一科室信号、卡片主题词与科室判断、mismatch 确认闸门（`confirm_department_checked`）、无信号阻断（`DEPARTMENT_SIGNAL_MISSING`）；侯凡凡 / 叶定伟 live 验收通过，知识条目见 [openalex-department-signal-works-concepts.md](./knowledge/data/openalex-department-signal-works-concepts.md)。
- Sprint 排期：2026-10-20 用户确认 Option A，Sprint 3 并入 Sprint 2。

## 下一步可选

- Sprint 2 剩余：Agent ROCKS（feature-03，AGT2-01）**WIP**（2026-10-21 开工）：实现 `prompts/v1` 模板注册表、元数据接线、时延预算与规则降级、eval-set 15 例。
- 候选新故事：医院中英文名归一（回顾 Opportunities #4：中文「南方医院」查不到库内 `Nanfang Hospital`）。

## 当前 OGT（进行中任务）

| # | 任务名称 | 影响的 SBI | Created | Status |
| --- | --- | --- | --- | --- |

（无进行中 OGT）

## 最近关闭的 15 项 OGT

| # | 任务名称 | 影响的 SBI | Created | Closed |
| --- | --- | --- | --- | --- |
| 5 | 生产 RAG 向量数据回灌：经 SSH 隧道以受控语料规范重灌（方案 A，[data-backfill-design.md](./go-live/1021/data-backfill-design.md)）；G1–G3 通过（academic 146 / compliance 23 三面一致），G4 冒烟待 Portainer 部署（[go-live Phase 6 S4](./go-live/1021/go-live-instruction.md)） | feature-02 / feature-08（MCP2-07/08 生产数据面） | 2026-10-21 | 2026-10-21 |
| 1 | retrieve_academic 低命中 coverage 信号与建议 ingest 落地（[ADR-014](../../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)；对应 [MCP2-07](product-backlog.md#pb-10) / [MCP2-08](product-backlog.md#pb-11)） | feature-02（MCP2-04） | 2026-10-21 | 2026-10-21 |
| 2 | 单一 env 配置文件（`.env.local`）与 `loadRootEnv` 6 处复制收敛到 `@hca/db` | - | 2026-10-20 | 2026-10-20 |
| 3 | 扩展 `query_hcp` 库外检索（并入式）、医院/科室包含匹配与 `add_hcp` candidate 校验 | Sprint 1 `feature-03`（并重开 `feature-01` 契约扩展） | 2026-10-20 | 2026-10-20 |
| 4 | 解决 RID-1：建立 `specs/.secrets` 并实机核对生产配置（SSH 野草云3） | - | 2026-10-19 | 2026-10-19 |

最后更新：2026-10-21 feature-03（Agent ROCKS，AGT2-01）开工准备完成（规格四件 + eval-set 15 例已决，[changes-log](changes-log.md)），feature-03 保持 ToDo、开工待用户确认；早前同日 feature-04、feature-08、feature-14 关闭，对外 MCP 八工具全齐；Sprint 2 保持 WIP（仅剩 feature-03）。
