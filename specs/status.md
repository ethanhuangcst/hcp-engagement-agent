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
| Sprint 2 | Done | 2026-10-22 关闭：feature-01–14 + task-02 + task-03（OPS2-01）十六条全 Done；MVP2 上生产（`sha-d9989ae`），zone `agent-mate.ai` Full (strict)，公网 MCP `https://hcp-mcp.agent-mate.ai/mcp` |

## 当前进展

- Sprint 2 已全部收口（2026-10-22 用户确认）：最后一条 SBI task-03（[OPS2-01](./product-backlog.md#pb-19) zone SSL Full (strict)）Done；Cloudflare zone 已 Full (strict)，四橙云 Host 源站 LE + Force SSL，八站矩阵与 MCP 八工具经边缘全绿。
- DEF-011（2026-10-22 关闭）：对外 MCP 公网入口 `https://hcp-mcp.agent-mate.ai/mcp`（CF 橙云 → NPM Host #11 → 容器 3300，LE 证书 #10，无鉴权）。
- MVP2 生产：`IMAGE_TAG=sha-d9989ae`，4 容器 Up，RAG 151/23 三面一致，TWIN 定时刷新北京 02:00；回滚锚点 `sha-03bd588`。
- 上线过程 DEF-008 / DEF-009 / DEF-010 已关闭；知识见 [shared-network-dns-alias-collision.md](./knowledge/ops/shared-network-dns-alias-collision.md)、[npm-batch-le-reload-dirty-config.md](./knowledge/ops/npm-batch-le-reload-dirty-config.md)。
- 剩余 Sprint SBI：无；进入 backlog / Sprint 3 规划期。
- mvp4 与 main 历史无关，发布走 tag（`v2.0.0`）流（回顾 Opportunities 仍 open）。

## 下一步可选

- Sprint 3 规划或 main 分支治理（force-align 或文档化 tag 流）。
- 候选故事：医院中英文名归一；存量 twin `profile.specialties` 空数组；Makefile `up`/`down`。
- 明晨核对：TWIN 首次 cron 触发后 `hcp_twins.as_of` 与容器日志（[release.md §6.2](./release.md)）。

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

最后更新：2026-10-22 Sprint 2 最终关闭（用户确认）：task-03 OPS2-01 Done，zone Full (strict)；十六条 SBI 全 Done，无进行中 SBI/OGT。
