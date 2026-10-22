# HCP Engagement Assistant 最新状态

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-22
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
| Sprint 2 | Done | 2026-10-22 关闭：feature-01–14 + task-02（MVP2 上线）十五条全 Done；对外 MCP 八工具、TWIN2 定时刷新、RAG 三面一致全部上生产（`sha-d9989ae`），Sprint Goal 经用户确认达成 |

## 当前进展

- Sprint 2 已关闭（2026-10-22，用户确认 Goal 达成）：MVP2 上生产（`IMAGE_TAG=sha-d9989ae` + compose `0d0430b`），4 容器 Up，对外 MCP 八工具检索确定性全绿，RAG 151/23 三面一致，web 全链（options / compliance / insights / add_hcp）验证通过，TWIN 定时刷新已启用（北京 02:00）。
- 上线过程当日发现并关闭 DEF-008（共享网络 DNS 别名串库，P0）/ DEF-009（web standalone 缺 onnxruntime 原生库）/ DEF-010（mcp2 MCP_URL loopback 口径）；kb-qdrant 误写已清理归零；知识条目 [shared-network-dns-alias-collision.md](./knowledge/ops/shared-network-dns-alias-collision.md)。
- 生产已知口径：回滚锚点 `sha-03bd588`；`RAG_ACADEMIC_FETCH=pubmed` 启用；mvp4 与 main 历史无关，发布走 tag（`v2.0.0`）流。
- 剩余 SBI：task-02（MVP2 上线，REL2-01，ToDo）。上线准备规格已修订就绪（[go-live 1021 手册](./go-live/1021/go-live-instruction.md)、env-changes、release.md 对齐八工具与 OGT-5 后基线）；阻塞项 B1 / B4 已清，B2 / B3（部署三件套合入 + mcp2 镜像）待执行。
- 回顾 Future action #5 已落地：[release.md](release.md) Step 5 补「live 临时脚本放仓库根 `.tmp-*.mts`」，`.gitignore` 补 `.tmp-*`（feature-08 验收批次）。
- 合规索引后台检查：`coverage.status=ready`（rdpac 15、cn_med_rep_measures 8）；已删除 Qdrant 孤儿点 `tenant-demo@2026-01`。
- OGT-5（2026-10-21 关闭）：生产 RAG 向量回灌完成。G1–G3 通过：生产 Qdrant academic 146 / compliance 23 点，与语料、manifest 三面一致，零测试残留；G4 冒烟待 Portainer 部署后执行（保留在 [go-live Phase 6 S4](./go-live/1021/go-live-instruction.md)）。执行记录见 [data-backfill-design.md](./go-live/1021/data-backfill-design.md)。
- DEF-007（2026-10-21 关闭）：seed-compliance 预检顺序自锁已修复（feature-14：main 改 ensure → health → seed，空库自举实机验证通过，本机数据 146/24 完好），见 [issues-log](issues-log.md)。
- B+ 专科信号增强已随 feature-11 / feature-12 关闭：OpenAlex 论文级 concepts 归一科室信号、卡片主题词与科室判断、mismatch 确认闸门（`confirm_department_checked`）、无信号阻断（`DEPARTMENT_SIGNAL_MISSING`）；侯凡凡 / 叶定伟 live 验收通过，知识条目见 [openalex-department-signal-works-concepts.md](./knowledge/data/openalex-department-signal-works-concepts.md)。
- Sprint 排期：2026-10-20 用户确认 Option A，Sprint 3 并入 Sprint 2。

## 下一步可选

- 候选新故事：main 分支治理（mvp4 与 main 历史无关，main 停在 1.0；force-align 或文档化 tag 发布流）；医院中英文名归一（Sprint 2 回顾 Opportunities）；存量 twin `profile.specialties` 空数组补齐（旧 16 条，可随 TWIN 刷新自然恢复）；Makefile `up`/`down` 封装（Sprint 1 遗留）。
- 明晨核对：TWIN 定时刷新首次触发（北京 02:00）后 `hcp_twins.as_of` 更新与容器日志 cron 行（[release.md §6.2](./release.md)）。

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

最后更新：2026-10-22 Sprint 2 关闭（用户确认）：task-02 MVP2 上线 Done，生产 `sha-d9989ae` 全绿；DEF-008/009/010 当日修复关闭；Sprint 1+2 全部收口，进入 backlog 规划期。
