# 变更记录（HCP Engagement Assistant）

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-22
> [Definition](../.cursor/templates/framework.sdd.works/sdd-scrum-practices.md#changes-logmd)

---

## 2026-10-22

### DEF-011 关闭：对外 MCP 公网入口上线（`hcp-mcp.agent-mate.ai`，零代码）

**原因**：用户 close confirm DEF-011（生产对外 MCP 公网入口可用）；方案当日定为不加鉴权、纯入口三件套（Cloudflare DNS → NPM → 容器 3300），无代码与镜像改动。

**变更内容**：
- **入口**：Cloudflare zone `agent-mate.ai` 加 `hcp-mcp` A → `38.55.192.140`（灰云签发后切橙云）；NPM 新 Host **#11**（上游容器名 `hcp-engagement-agent-hcp-engagement-mcp-1:3300`、Websockets、Advanced `proxy_buffering off; proxy_read_timeout 300s;`）+ LE 证书 **#10**（HTTP-01，至 2027-01-20）；主机端口 3205 维持 loopback-only 运维后门。
- **排障**：zone SSL 模式实为 **Flexible**，`ssl_forced` 与其互踩 301 循环 → Host #11 关 `ssl_forced`（与主站同款姿态）；DNS 300 秒 TTL 缓存两度造成「橙云未生效」误判，经权威 NS 非递归查询与 `--resolve` 强制边缘复核确认生效。
- **客户端**：`~/.cursor/mcp.json` 的 `hcp-engagement-mcp` 条目换 `https://hcp-mcp.agent-mate.ai/mcp`（一行 url）。
- **跨仓**：release-bot 四文件反向更新并推送（`1644738`）：野草云3 清单刷 hcp 2.0 四服务 + Host #11 + 专属别名 `hcp-qdrant` + 实跑 tag `sha-d9989ae`；knowledge 05/08/09 记 Flexible 陷阱、TTL 缓存坑、共享网别名唯一规则。

**验收**：经 CF 边缘（`cf-ray` 在）全链绿：`/health` 200、`initialize` + `tools/list` 八工具、`retrieve_academic`（朱同玉 kidney transplant）5 chunks 且 specialty 正确带真实 pmid、流式完整；共存抽查 hcp / kb / places 全 200；Portainer API 实查 4 容器 running `sha-d9989ae`。

**回顾门**：本缺陷无新增 hcp 仓知识条目——durable 教训（Flexible 陷阱、TTL 缓存、NPM API 字段名）已在同会话落入 release-bot knowledge 05/08/09，属正确归属。

**遗留**：zone 迁 Full (strict) 建议（先补主站 / Portainer / NPM 管理面三张源站证书）双仓记录待排；无鉴权公网暴露残余风险知情记录于 [release.md §6.1](release.md)。

---

### On-demand 回顾：上线过程操作错误复盘（用户发起）

**原因**：用户 `/sdd-retrospective` 要求记录 MVP2 上线过程中若干错误的更新（操作层面，区别于 DEF-008/009/010 产品缺陷）。

**变更内容**：新建知识条目 [prod-ops-output-and-assertion-discipline.md](knowledge/ops/prod-ops-output-and-assertion-discipline.md)（密钥文件与运维 API 响应脱敏、冒烟断言不吞错误信封、编辑/清理小纪律）；sprint-backlog Sprint 2 Retrospective 追加 On-demand 块 #12；knowledge README 索引更新。

**验收**：七项过程错误逐条复核（两项泄露、一项断言误导、四项小事故），无残留项；**open item：MySQL root 密码（共享实例）已进 chat，轮换待协调窗口**。

---

### Sprint 2 关闭 + task-02（MVP2 上线）Done

**原因**：用户 close confirm task-02 可用与 Sprint 2 Goal 达成（Sprint 2 全部 SBI Done：feature-01–14 + task-02）。

**变更内容**：task-02 标 Done（执行记录见同日条目）；`RAG_DEBUG` 移出生产 compose 并复验（S4/S10 5/5）；sprint-backlog Sprint 2 Status → Done + Sprint-end 回顾；product-backlog REL2-01 → Done；issues-log DEF-008/009/010 关闭（Sprint 2）；status.md 同步。

**验收**：生产 `sha-d9989ae` + compose `0d0430b`：4 容器 Up、八工具检索确定性、RAG 151/23 三面一致、web 全链 200、共存抽查过；TWIN cron 已启用（北京 02:00）。

---

### task-02 执行：MVP2 上线完成（REL2-01，冒烟全绿，待 close confirm）

**原因**：用户确认开工 task-02（MVP2 上线）；执行 [go-live 1021 手册](go-live/1021/go-live-instruction.md) 全流程并处置冒烟发现的三缺陷。

**变更内容**：
- **镜像链**：mvp4 与 main 历史无关 → 部署三件套路径检出入 mvp4（`2f0e796`，含新建 `Dockerfile.mcp2` / compose 第 4 服务 `127.0.0.1:3205` / CI matrix 第三项）；出镜像走 tag `v2.0.0`（非 merge-main），CI 四轮至 `sha-d9989ae`；生产 `IMAGE_TAG=sha-d9989ae`。
- **缺陷修复（当日发现当日关闭）**：[DEF-008](issues-log.md) 共享网络 `qdrant` 别名冲突（DNS 轮询串库 → 专属别名 `hcp-qdrant` + security 白名单 + `QDRANT_ALLOW_NON_LOCAL`）；[DEF-009](issues-log.md) web standalone 缺 `libonnxruntime.so`（Dockerfile.web 显式 COPY）；[DEF-010](issues-log.md) mcp2 `MCP_URL` 宿主机 loopback 口径容器内不可达（compose 显式容器名）。kb-qdrant 误写 5 点清理归零复核；我方 geriatrics 经 MCP 重灌（146→151）。
- **环境**：`TWIN_REFRESH_CRON=0 18 * * *`（北京 02:00）启用、`RAG_ACADEMIC_FETCH=pubmed` 转正、`RAG_DEBUG=1` 排障开关保留（收口复核后移除）。
- **验证**：S1 web health / S3 mcp2 health（8 工具）/ S4+S10 连跑 8 轮确定 5 chunks / S11 kidney 真库 9 / S5 `kol_04 吴一龙` add_hcp 全链（入库 `hcp_a5096267356` + incremental build + oncology 预灌 + specialty_preview matched）/ web options 200 真实 LLM + compliance 闸门 pass / S9 共存抽查（kb/places/portainer 200）。回滚锚点 `sha-03bd588`。
- **知识**：[shared-network-dns-alias-collision.md](knowledge/ops/shared-network-dns-alias-collision.md)（DNS 轮询串库识别特征与修复模式）；[release.md](release.md) §1.2 DNS 别名红线 + §4 新 env 行。

**验收**：[go-live-instruction.md](go-live/1021/go-live-instruction.md) 全 Phase 通过（执行记录见文件头）；生产 4 容器 `sha-d9989ae` Up；RAG 三面一致（151/23 + manifest）。task-02 行保持 WIP，待用户 close confirm 后标 Done。

---

### feature-03 Done：Agent ROCKS 质量优化（AGT2-01）

**原因**：Sprint 2 目标要求 Agent 一人一策、开放对话与一句话洞察在真实 LLM 下达到可验收质量（ROCKS 范式）；用户 close confirm feature-03 可用。

**变更内容**：
- `packages/hcp-engagement-agent`（实现随 `61410eb` 提交，本批收口）：`src/prompts/v1/` 模板注册表（四模板 `{ name, version: "v1", text }`，ROCKS 五段注释分节）；propose / revise / synthesize / chat 四路径 `meta.template` 元数据接线；`latency.ts` 计时写 `latency_ms` 与 `over_budget`；超时 / 无 Key 降级复用 `ruleProposeOptions` / `ruleSynthesizeDoingNow` 并标 `degraded: true`（`LLM_UNAVAILABLE` 语义保留）。
- 评测门禁（US-AGT-008）：`eval/cases.ts` 15 例（一人一策 5 · 开放对话 5 · 一句话洞察 5，每类 #1 朱同玉 fixture 锚点）+ `eval/run-eval.ts` + `npm run eval:agent`（opt-in）；首跑报告归档 [eval-20261021T131400.json](../packages/hcp-engagement-agent/eval/reports/eval-20261021T131400.json)：15/15 过、零红线，propose 13–20 s / open_chat 5–11 s / synthesize 2–4 s 均在预算内（[agent-design §13.3](agent/agent-design.md) 初值维持 30 s / 15 s）。
- process：sprint-backlog feature-03 → **Done**（Sprint 2 功能 SBI 全部收口，剩 task-02 MVP2 上线）；product-backlog AGT2-01 → **Done**；status.md 同步。

**验收**：agent 46/46 绿（含 rocks.test.ts）、typecheck 0 错（含 eval tsconfig）；eval gate `gate_pass: true`（15/15，无红线）；用户 close confirm feature-03。

---

### REL2-01 新增与 MVP2 上线准备规格修订（spec-to-build，不动代码）

**原因**：用户指令新增 MVP2 上线 PBI（Task）并完成上线准备；上线规格与实际状态漂移——1021 手册与 env-changes 仍写「5 个 MCP 工具 / 生产 Qdrant 空 / 46 文件未提交」，而 feature-04 / 08 已收口（八工具）、OGT-5 已回灌（146 / 23）、工作区已提交（`61410eb`）。

**变更内容**：
- [product-backlog.md](product-backlog.md)：新增 [REL2-01](product-backlog.md#pb-18)（MVP2 上线，Task，需求条目 pb-18 + Backlog 行 18，Sprint 2，ToDo）与变更记录行。
- [sprint-backlog.md](sprint-backlog.md)：Sprint 2 ToDo 新增 SBI task-02（MVP2 上线，# 16）；feature-03 保持 WIP 不动。
- [go-live-instruction.md](go-live/1021/go-live-instruction.md)：阻塞项表标状态（B1 / B4 已清，B2 / B3 待执行）；Phase 0.1 置已完成留档；Phase 1 预检与回滚锚点对齐 OGT-5 后基线（collections 146 / 23）；Phase 6 冒烟新增 S10（retrieve_compliance）与 S11（get_ingest_status）；工具面通告改 8 工具全集；新增「已知数据差异」节（geriatrics 第 29 专科目录 vs 语料 / 生产 28 学科；生产无 `RAG_ACADEMIC_FETCH` 时 `ingest_academic` 返回 `SOURCES_UNAVAILABLE` 属已知限制）。
- [env-changes.md](go-live/1021/env-changes.md)：工作区基线改 `61410eb`（已提交）；§1.2 改「生产 Qdrant 已回灌」；§3 工具行改 8 工具；§4 改已处置；§5 基线 collections 行更新。
- [release.md](release.md)：as_of 2026-10-22；§1.1 服务表预登 `hcp-engagement-mcp`（`127.0.0.1:3205→3300`）；§3-6 与 §6.3 阻塞项状态更新并挂 REL2-01 跟踪；§6.1 端口定稿 3205；§5 冒烟补对外 MCP 健康行；§2 注改八工具。
- 信息源核对：`~/code/release-bot` 无 hcp 专属发布记录，上一次上线基线（`main@03bd588` / `latest`）已在本仓库 specs，无需引入新信息；密钥沿用 `specs/.secrets` 现值，无新增。

**验收**：B2 / B3 待执行状态与 mvp4 实查一致（`git ls-files` 无 docker / compose / CI 三件套）；geriatrics 差异已入手册「已知数据差异」；`git status` 无代码文件改动（本批仅 specs）。

---

## 2026-10-21

### feature-03 开工准备：AGT2-01 规格四件与 process 同步（不动代码）

**原因**：feature-03（Agent ROCKS 质量优化，AGT2-01）开工前 agent 模块规格不齐：三件规格停在 spec1.0 口径（as_of 2026-07-17）、无 AGT2-01 功能编号与故事，[architecture §12](architecture.md) eval-set 用例数挂起待定。

**变更内容**：
- [agent-function-spec.md](agent/agent-function-spec.md)：新增「Sprint 2 增补」节 F-AGT-031 ~ 034（模板版本化、ROCKS 五段、eval 门禁、时延预算与降级）。
- [agent-stories.md](agent/agent-stories.md)：新增 US-AGT-007（三类输出质量可验收）与 US-AGT-008（评测门禁 15 例），Gherkin 场景、追溯矩阵行与验收顺序 Sprint 2 段。
- [agent-design.md](agent/agent-design.md)：新增 §13 feature-03 技术设计（`prompts/v1` 常量模块非运行时读盘、eval 门槛三类各 ≥ 4/5 且无红线、`latency_ms` 元数据与规则降级接线、预算初值待实测校准），原「相关文档」顺延 §14。
- 新建 [agent-tests.md](agent/agent-tests.md)（单元 mock 断言 / 33 例回归 / eval opt-in / live 抽检四层），并注册进 `artifacts-map.json` agent files。
- [architecture.md](architecture.md)：§12 开放问题「ROCKS eval-set 用例数」置已决（三类各 5 例合计 15，朱同玉 fixture 锚点）。
- [sprint-backlog.md](sprint-backlog.md)：feature-03 行 Related specs 补四件规格链接，Status 保持 **ToDo**。

**验收**：规格四件与 [architecture §7](architecture.md) / ADR-2.0-6 口径一致、互相引用可达；`git status` 无代码文件改动。feature-03 开工待用户确认。

---

### feature-04 Done：retrieve_compliance 对外工具（MCP2-05）

**原因**：Sprint 2 需集成方经对外 MCP 检索合规条款引用并确认互动形式不触红线（ADR-012：预审不经对外 MCP、`tenant_id` 不作入参）；用户 close confirm feature-04 可用。

**变更内容**：
- `@hca/hcp-engagement-mcp`：`retrieve_compliance` 注册与契约测试 12 例（实现随 feature-08 前序会话提交，本批验收）：`hcp_id` 必填，`query` / `interaction_type` 可选，缺省用默认合规检索词（同 propose.ts）；schema 无 `tenant_id` / `jurisdiction` 键；description 声明不是预审判定、不替代正式 MLR；MKB2-03 `coverage` / sparse `repair_hint` 透传，底层 `retrieveComplianceForAgent` 已随 feature-13 落地。
- 对外工具至此 8 个齐全（[mcp2-design §3](mcp2.0/mcp2-design.md) 全集）。

**验收**：engagement-mcp 97/97、agent 33/33、medical-kb 99/99、typecheck 0 错；live（`:3300`）：朱同玉只传 `hcp_id` → 5 chunks（首条 `CN-MR-7` / cn_med_rep_measures / `2026-08`），全部 chunk 无租户标记，`coverage: ready`（2 authority），缺号 → `NOT_FOUND`。用户 close confirm feature-04。

---

### feature-08 Done：ingest_academic 对外工具（MCP2-08）

**原因**：Sprint 2 需集成方按专科显式触发知识灌注并查询进度（[ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md) 决策 3）；用户 close confirm feature-08 可用。

**变更内容**：
- `@hca/hcp-engagement-mcp`：注册 `ingest_academic` / `get_ingest_status`（[mcp2-design §14](mcp2.0/mcp2-design.md)）；`ingest_academic` 写工具（`readOnlyHint: false`、`openWorldHint: true`），`get_ingest_status` 只读；`retrieve_academic` sparse 时 `repair_hint` 点名 `ingest_academic`（实现于前序会话提交，本批共 8 工具）。
- `@hca/hcp-engagement-agent`：再导出 `ingestOnDemand` / `getIngestStatus`。
- 契约测试 11 例（进度 job_id / specialty 两路径、幂等跳过、`INGEST_IN_PROGRESS`、`VALIDATION_ERROR`、`INTERNAL_ERROR` 无泄漏、annotations）。
- 附带兑现回顾 Future action #5：[release.md](release.md) Step 5 补「live 临时脚本放仓库根 `.tmp-*.mts`」；`.gitignore` 补 `.tmp-*`。

**验收**：engagement-mcp 97/97、agent 33/33、全仓 typecheck 0 错（重建 agent dist 后）；live 冒烟（`:3300`）：tools/list 8 工具、`ingest_academic(肾移植)` 归一 kidney_transplant 幂等跳过返回 `knowledge_status: ready`、`get_ingest_status` 两路径 `chunk_count: 9`。用户 close confirm feature-08。

---

### feature-14 Done：seed CLI 启动序统一（DEF-007 关闭，MKB2-05）

**原因**：DEF-007：`seed-compliance.ts` 的 main 先 `health()`（探测读要求双 collection 已存在）后 ensure，空库上 404 中止且需人工预建集合绕过；用户 close confirm feature-14 可用。

**变更内容**：
- `@hca/medical-kb`：`seed-compliance.ts` main 改 `ensureDualCollectionsWithProbe()` → `health()` → seed 启动序（[rag-design §21](rag/rag-design.md)），预检不过以退出码 1 终止；`health()` 与 ensure 本身不动，DEF-004 探测口径不变。
- 新增 `src/cli/seed-compliance.test.ts` 2 例启动序回归（mock `../api.js`，断言 ensure → health → seed 调用顺序、预检失败不 seed 且退出码 1）。
- 知识笔记：[ssh-tunnel-qdrant-backfill-pitfalls.md](knowledge/ops/ssh-tunnel-qdrant-backfill-pitfalls.md) 补陷阱 5（本机空库验证的存储换装法）。

**验收**：medical-kb 99/99（含新增 2 例）、typecheck 0 错、engagement-mcp 97/97 回归；实机空库（临时空存储换装）直跑 `npm run seed:compliance` 全流程通过、无人工预建（seeded 23、EXIT=0），验毕恢复原存储并核对 146/24；DEF-007 Close Check 三项全达成。用户 close confirm feature-14 / MKB2-05。

---

### DEF-007 开工准备：MKB2-05 规格写入与排期（不动代码）

**原因**：OGT-5 关闭同批，用户指令完成 DEF-007 修复开工准备；止损口径沿用 feature-06 / feature-10 先例（缺陷修复独立小 SBI、规格先行）。

**变更内容**：
- 新增 PBI [MKB2-05](product-backlog.md#pb-17)（seed CLI 启动序统一，Sprint 2，ToDo）与 SBI feature-14（sprint-backlog Sprint 2 ToDo）。
- 规格：[rag-design §21](rag/rag-design.md)（启动序契约）、[US-RAG-010](rag/rag-stories.md)（四场景）、[rag-tests §8](rag/rag-tests.md)（单元 / 集成 / 实机三层）。
- [issues-log](issues-log.md) DEF-007 Related 补三处规格引用。

**验收**：规格三件就位，覆盖 DEF-007 Close Check 全项；feature-14 保持 ToDo、不动代码、不置 WIP。开工待用户确认。

---

### OGT-5 Done：生产 RAG 向量数据回灌（方案 A 规范重灌）

**原因**：生产节点 Qdrant 双集合为空、manifest 与向量脱节，上线前需把受控语料回灌到与 manifest 三面一致；用户确认回灌数据并 close confirm OGT-5 关闭。

**变更内容**：
- 生产 Qdrant（经 SSH 隧道执行）：`academic_index` 28 学科 146 点、`compliance_index` 23 点（rdpac 15 + cn_med_rep_measures 8）；生产 MySQL manifest 30 行幂等覆盖、31 个 seed job 全 ready（其中 2 行卡 running/pending 按实测置 ready，用户已接受）。
- 清理隧道窗口期串写的 tenant-demo 测试点 1 个（compliance count 回 23）。
- 文档：[data-backfill-design.md](go-live/1021/data-backfill-design.md) 执行记录与基线口径修正（146/23）；[go-live-instruction.md](go-live/1021/go-live-instruction.md) Phase 3 标注已执行、补 `--force --no-fetch` 与空库绕法。
- 缺陷：DEF-007（seed-compliance 空库自锁）登记 [issues-log](issues-log.md)。
- 知识：[ssh-tunnel-qdrant-backfill-pitfalls.md](knowledge/ops/ssh-tunnel-qdrant-backfill-pitfalls.md)。

**验收**：G1–G3 三面一致（语料 146/23 = manifest 合计 = 向量 count）；31 job 全 ready；零测试残留。G4（MCP 冒烟）待 Portainer 部署新镜像后执行（保留在 go-live Phase 6 S4）。本机 Qdrant 已恢复且原数据完好（146/24）。用户确认 OGT-5 关闭。

---

### feature-13 Done：合规知识覆盖信号与条款版本治理（MKB2-03）

**原因**：合规检索缺 coverage 信号、种子稀疏、同 authority 多版本并存；用户 close confirm feature-13 可用。

**变更内容**：
- `@hca/medical-kb`：`complianceCoverage()`（F-RAG-030）；`retrieveCompliance` 返回 `coverage` / sparse 时 `repair_hint`；`seedCompliance` 灌新版本后按 manifest 删除旧版本点（F-RAG-031）；rdpac 15 条、cn_med_rep_measures 8 条种子（F-RAG-032）。
- `@hca/hcp-engagement-agent`：`retrieveComplianceForAgent` 透传 coverage / repair_hint。
- 规格：`mcp2-design.md` §11、`mcp2-stories.md` US-MCP2-003、`mcp2-test.md` §12 补 coverage 契约。
- 知识：[tsx-live-verify-from-workspace-root.md](knowledge/ops/tsx-live-verify-from-workspace-root.md)。

**验收**：medical-kb 97/97（含 compliance.test.ts 13 例）、agent 27/27；live coverage `ready`（rdpac 15、cn_med_rep_measures 8）；gov_e2e 版本治理 E2E；清理 Qdrant 孤儿点 `tenant-demo@2026-01`。

---

### Sprint 2 批量收口：feature-02 / 07 / 09 / 10 / 11 / 12 Done，DEF-003–006 关闭

**原因**：六条 SBI 实现与验收完成，用户一次性 close confirm 十项（六 SBI、四缺陷、OGT-1）可用。

**变更内容**：
- feature-12 附加 B+ 信号补全：`query_hcp` 卡片列主题词与「科室判断 / 是否按 X 入库」问句；resolve 论文级概念懒加载（`fetchOpenAlexWorkConcepts`）；`medical-kb` 增 OpenAlex 概念映射表（`openAlexConceptSpecialty`）与口语缩写归一（神内 / 肾内）。
- 知识笔记：[openalex-department-signal-works-concepts.md](knowledge/data/openalex-department-signal-works-concepts.md)。

**验收**：全仓 typecheck 0 错、7 包测试全绿（domain 40 / db 12 / agent 27 / engagement-mcp 73 / twin-mcp 55 / medical-kb 84 / web 13）；侯凡凡 live 三点验收（卡片标 mismatch 与肾内科、列 5 条、问询入库）+ 确认后按肾内科入库 + 令牌作废；叶定伟 live 入库后 urology `coverage: ready` 检索 5 条；用户确认 1–10 全部关闭。

---

### feature-01 Done：get_hcp_insights 对外工具（MCP2-03）

**原因**：Sprint 2 需集成方经对外 MCP 读取 HCP 洞察；ADR-013 的按需合成入口已在 feature-05 落地，本故事完成 MCP 接线与契约验收。

**变更内容**：
- `@hca/hcp-engagement-mcp`：注册 `get_hcp_insights`（`hcp_id` 必填、`readOnlyHint: false`）；注入 `GetTwinFn` / `GetInsightsFn` / `EnsureDoingNowFn`；处理流按 §9（预检 → 纯读 → 按需合成 / pending）；workspace 依赖 `@hca/hcp-engagement-agent`。
- 契约测试 9 例（纯读、合成 `synthesized: true`、pending 两原因、null insights、`NOT_FOUND`、`_agent_general`、INTERNAL_ERROR 无泄漏、annotations）。
- 规格：`mcp2-design.md` §9、`mcp2-stories.md` US-MCP2-002、`mcp2-test.md` §10（开工准备批次）。

**验收**：engagement-mcp 42/42、agent 27/27；typecheck / build 绿；本地 `:3300` 对朱同玉两条实调纯读成功；用户 close confirm feature-01 可用。

---

## 2026-10-20

### OGT-1 Done：单一 `.env.local` 与 `loadRootEnv` 收敛

**原因**：env 加载逻辑在 6 处复制且口径不一（部分只读 `.env`）；仓库根只有 `.env.local` 时这些入口静默跳过 env，live 测试与 CLI 依赖手工 source。

**变更内容**：
- `@hca/db`：`index.ts` 导出 `loadRootEnv`（唯一实现，`.env` 后 `.env.local` 覆盖）。
- 删除五处 CLI 复制改引共享实现：twin-mcp / engagement-mcp cli、medical-kb 两个 seed cli、agent `synthesize-zhu`（后三处原只读 `.env`，属隐性故障一并修复）。
- 删除三处测试 `loadEnv` 复制（medical-kb `api.test.ts`、agent `api.test.ts` / `engagement.test.ts`，原同样只读 `.env`），改 `loadRootEnv()` 并保留 `chdir`。
- `.env.example` 首行注释改 `Copy to .env.local`（用户确认 diff，仅此一行）。
- `spec1.0/4.install-dependencies.md`：§0.2、推荐顺序、§11.1、§14 四处 `cp` 与门禁表改 `.env.local`；§7.3 示例块与两处密钥规则同步。

**验收**：包目录 cwd 冒烟加载 `.env.local` 成功；清空 shell env 后 medical-kb 24/24、agent 27/27（均 live）自加载通过；db 39/39、twin-mcp 41/41、engagement-mcp 32/32；全仓 typecheck 0 错误；用户 close confirm OGT-1 可用。

---

### feature-05 Done：定时刷新数字分身（TWIN2-01）

**原因**：TWIN2-01 需系统按计划自动刷新已保存数字分身；ADR-013 要求 build 完成后经 `ensureDoingNow` 回填洞察、`add_hcp` 异步触发共用管线。

**变更内容**：
- `@hca/hcp-twin-mcp`：`scheduler/refresh.ts`（`createRefreshScheduler`，cron 门 / TTL / 排除 `_agent_general` / 顺序执行 / 失败隔离 / JSON 结构化 stderr 日志）与 `scheduler/boot.ts` 装配；`build/queue.ts` 加 `onBuildComplete` 钩子与 `waitFinished`；依赖 `node-cron ^3.0.3`。
- `@hca/hcp-engagement-agent`：`ensure-doing-now.ts`（幂等 / in-flight 去重 / LLM 失败降级 pending）。
- `@hca/hcp-engagement-mcp`：`add_hcp` 注入 `TriggerBuildFn`，写库成功后异步触发 build 并返回 `refresh: { run_id }`；触发失败仅记日志不阻塞写库。
- 规格：ADR-013 相关口径已在前序变更同步。

**验收**：twin-mcp 41/41、engagement-mcp 32/32、db 39/39、agent 27/27（live LLM）；typecheck 全绿；用户 close confirm feature-05 可用；`product-backlog.md` TWIN2-01 行 Done。

---

### feature-06 Done：元数据层 MySQL 方言修复（DEF-002 关闭）

**原因**：DEF-002：`jobs.ts` 与 `api.ts` / `academic.ts` 的元数据读写仍是 Postgres 方言（`$n` 占位、`ANY($2::text[])`、`ON CONFLICT DO UPDATE`、`RETURNING *`），打 MySQL 池必失败；ADR-005 迁移遗留，被过期 db dist 掩盖。

**变更内容**：
- `@hca/medical-kb`：`jobs.ts` 五函数改 MySQL 方言（`?` 占位、`IN (?, ?)`、写后按 `job_id` 回读 SELECT、`error` 列写 `JSON.stringify` 读侧容错解析）；`api.ts` / `academic.ts` 两个 manifest upsert 改 `INSERT ... AS new ON DUPLICATE KEY UPDATE` 并导出；`IngestJobRow extends RowDataPacket` 对齐 db 包模式；新增 type-only 依赖 `mysql2 ^3.24.6`。
- 新增 `src/mysql-dialect.test.ts` 11 用例（mock `getPool`，断言方言形状、参数与占位符一致、回读与 JSON 往返）。
- [issues-log](issues-log.md)：DEF-002 移入已关闭。
- 知识笔记：[local-binary-exec-bit.md](knowledge/ops/local-binary-exec-bit.md)。

**验收**：medical-kb 24/24（含 live MySQL 真跑 upsert / jobs 路径与 Qdrant 灌库检索）、`@hca/hcp-engagement-agent` 27/27 回归、全仓 typecheck 0 错误、全仓 dist 重建；用户 close confirm feature-06 与 DEF-002 关闭。

---

### ADR-013：洞察 LLM 合成三触发源与幂等回填（specs 同步）

**原因**：用户确认组合方案——`add_hcp` 写库成功后异步触发一次刷新（返回 `refresh: { run_id }`）；`get_hcp_insights` 空模板且事实足够时服务器内合成并写回缓存。否则不经网页的 MCP 调用方拿不到 LLM 洞察，链路不闭环。

**变更内容**：
- 新增 [ADR-013](../docs/adr/ADR-013-insight-synthesis-triggers.md)：统一幂等入口 `ensureDoingNow(hcpId)`；三触发源（build 完成、TWIN2-01 定时、`get_hcp_insights` 按需）收敛到该入口；LLM 失败降级空模板 + `pending`；`get_hcp_insights` `readOnlyHint` 改 `false`，并写明对 ADR-012 的修订（洞察缓存回填属数据面幂等写，非决策面）。
- `mcp2-design.md`：§3 映射表 `get_hcp_insights`、`add_hcp` 行更新；§8 增补异步触发；新增 §9 `get_hcp_insights` 技术设计。
- `agent-design.md`：§3 新增 `ensureDoingNow` 入口行；§5 路径 A 补三触发源。
- `architecture.md`：§5.2 工具表 `get_hcp_insights` 行；§6 TWIN2-01 表补洞察合成与 `add_hcp` 联动；§9 Sprint 2/3 门禁补 ADR-013 项；§11 决策表补 ADR-2.0-7。
- `product-backlog.md`：MCP2-02、MCP2-03、TWIN2-01 需求 bullets 更新 + 变更记录行。
- 代码无变更：实现随 Sprint 2 的 feature-05（基建）与 feature-01（接线）落地。

**验收**：specs 全文 `get_hcp_insights` 不再标注纯读；ADR-013 与五处 specs 口径一致。

---

### Sprint 排期：Sprint 3 并入 Sprint 2

**原因**：用户确认 Option A，将 Sprint 3 的合规检索与定时刷新与 Sprint 2 的数据面洞察、学术检索、Agent ROCKS 合并为一轮交付。

**变更内容**：
- `product-backlog.md`：MCP2-05、TWIN2-01 的 Sprint 列改为 Sprint 2。
- `sprint-backlog.md`：Sprint 2 目标更新；新增 SBI feature-04 / feature-05；移除 Sprint 3 章节；Total sprints 改为 2。
- `status.md`：项目进度与下一步可选对齐合并后的 Sprint 2。

**验收**：`sprint-backlog.md` 仅 Sprint 1（Done）与 Sprint 2（ToDo）；五条未完成 PBI 的 Sprint 列均为 Sprint 2。

---

## 2026-10-20

### ADR-012：对外 MCP 2.0 只暴露数据面（specs 同步）

**原因**：外部 agent 调用方 prompt 可被注入，服务器无法验证其意图与 `product_context`；受监管内容的生成与合规闸门触发须留在可信执行环境。

**变更内容**：
- 新增 [ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)：工具集改为 `list_hcp`、`query_hcp`、`add_hcp`、`get_hcp_insights`、`retrieve_academic`、`retrieve_compliance`；`propose_engagement_options` / `precheck_compliance` 移除；`tenant_id` 不作工具入参；本地草拟与远程提案边界写明。
- specs 同步：product-backlog（概览、pb-4/pb-5、PBI 表、变更记录）、mcp2-design（§1 边界、§3 映射）、mcp2-stories（US-MCP2-002/003）、mcp2-test（§3 门禁）、architecture（§5.2、§5.5、AGT2-01 交付面、Sprint 门禁）、sprint-backlog（Sprint 2/3 目标与 feature 行）。
- 代码无变更：Agent 包内部五 tool 与包级 API 不变；`retrieve_*` 两个 MCP 工具随 Sprint 2/3 落地。

**验收**：specs 全文不再把 propose / precheck 列为对外工具；ADR-012 与六处 specs 口径一致。

---

### Sprint 1 关闭（sprint-end）

**原因**：四条 SBI（task-01、feature-01、feature-02、feature-03）均 Done；用户确认 Sprint Goal 达成（不打开 Web 即可列表、查询并新增已保存 HCP）。

**验收**：`list_hcp` 实调 count=6；朱大龙经 `query_hcp` 库外检出、`add_hcp` 写入成功（`hcp_a5054096151`）；三包测试与 typecheck 全绿。

---

### OGT-1 / feature-03 Done：add_hcp 候选令牌门与 query_hcp 库外检索扩展

**原因**：Sprint 1 需集成方经 `query_hcp` 库外检出、人选认后 `add_hcp` 写库；库内医院/科室短式包含匹配（ADR-011）；写前模糊查重（ADR-009）与候选令牌（ADR-010）。

**变更内容**：
- `@hca/domain`：`AuthorIdsSchema.openalex_aliases`（ADR-004 加式）。
- `@hca/db`：`confirmAndSaveTwin` / `normalizeAuthorIds`；`filtersMatch` ADR-011；导出 `NameMatchTier`、`normalizeCompare`。
- `@hca/hcp-engagement-mcp`：`CandidateStore`；`query_hcp` `include_external` + `internalMcpUrl`；`add_hcp` `candidate_id` 门；契约测 29 项。
- 规格与 ADR：`mcp2-design` §6 增补 / §8、`mcp2-test` §6 增补 / §9、`mcp2-stories` US-MCP2-004/006；`5.hcp-twin-data-dictionary` §3.2.1；[ADR-010](../docs/adr/ADR-010-external-resolve-and-candidate-token.md)、[ADR-011](../docs/adr/ADR-011-hospital-department-substring-match.md)。

**验收**：`@hca/domain` 12/12、`@hca/db` 39/39、`@hca/hcp-engagement-mcp` 29/29；typecheck 三包通过；实机降级路径、完整旅程（含令牌作废）；用户实调朱大龙·鼓楼医院·内分泌科写入 `hcp_a5054096151`；close confirm OGT-1 / feature-03 可用。

---

### feature-02 Done：list_hcp 对外工具

**原因**：Sprint 1 需集成方通过 MCP 列出与 Web 同范围的已保存 HCP（不含 `_agent_general`）。

**变更内容**：
- `@hca/hcp-engagement-mcp`：`list_hcp` 接 `@hca/db` `listTwins`，返回 `{ count, items }`；`ListTwinsFn` 可注入；DB 失败映射 `INTERNAL_ERROR`。
- 契约测：`list_hcp` 全量/空库/错误不泄漏连接串；`add_hcp` stub 测改用合法必填参数。
- 规格：`specs/mcp2.0/mcp2-stories.md`（US-MCP2-005）、`mcp2-design.md` §7、`mcp2-test.md` §8。

**验收**：`npm run test -w @hca/db` 23/23、`@hca/hcp-engagement-mcp` 9/9；MCP 实调 `list_hcp` count=5、无 `_agent_general`；用户 close confirm feature-02 可用。

---

## 2026-10-19

### feature-01 Done：query_hcp 与 DEF-001 MySQL 对齐

**原因**：Sprint 1 需可用的 `query_hcp`；`DATABASE_URL` 为 MySQL 时 `@hca/db` 必须用 mysql2 方言；集成方需拉丁姓名逗号、连字符、称谓与模糊规则。

**变更内容**：
- `@hca/db`：`mysql2` 客户端与 MySQL 迁移路径；`nameMatchTier`（词序、编辑距离、逗号/连字符/撇号/行首称谓）。
- `@hca/hcp-engagement-mcp`：`query_hcp` 接 `queryTwins`；`name` 参数说明与 [mcp2-design §6](mcp2.0/mcp2-design.md)。
- 规格：`specs/db/*`、`specs/mcp2.0/*`；[ADR-005](../docs/adr/ADR-005-mysql-primary-store.md) 落地。

**验收**：`npm run test -w @hca/db` 23/23、`@hca/hcp-engagement-mcp` 6/6；MCP 实查 `yalin han`、`changxi wang`、`zhutongyu` count≥1；用户 close confirm feature-01 与 DEF-001 可用。

---

## 2026-10-19

### DEF-001 Closed：@hca/db 运行时 pg → mysql2

**原因**：P0 缺陷；MCP 与 Web BFF 共用 `@hca/db`，Postgres 驱动与 MySQL URL 不兼容。

**变更内容**：同 feature-01 的 `@hca/db` 修复；[issues-log](issues-log.md) 移入已关闭。

**验收**：Close Check 满足（两包测试绿、无运行时 `pg`、MCP 按姓名可命中已保存医生）。

---

## 2026-10-19

### task-01 Done：对外 MCP 2.0 骨架与 HTTP-only（ADR-008）

**原因**：Sprint 1 需可本地启动的 `@hca/hcp-engagement-mcp`，注册 `list_hcp` / `query_hcp` / `add_hcp`（stub）；传输定稿为仅 Streamable HTTP。

**变更内容**：
- 新建 `packages/hcp-engagement-mcp`（server / transport / cli、4 条 vitest、根 `dev:hcp-engagement-mcp`）。
- [ADR-008](../docs/adr/ADR-008-mcp2-http-only-transport.md)：移除 stdio 与 `MCP2_TRANSPORT`；`.cursor/mcp.json` 为 `url: http://localhost:3300/mcp`。
- 同步 `specs/mcp2.0/*`、`specs/architecture.md`、`specs/release.md`。

**验收**：包测试 4/4；`GET /health` 与 MCP initialize 烟测通过；用户 close confirm 可用。

---

## 2026-10-19

### OGT-1 / RID-1 收口：specs/.secrets 与 .gitignore、.env.example

**原因**：生产密钥散落 `specs/.tmp` 且无 gitignore 防护；`.env.example` 示例连接串停留在 ADR-005 之前的 Postgres。

**变更内容**：
- 新建 gitignored `specs/.secrets`（野草云3 凭证 + 2026-10-19 SSH 实测的生产 `DATABASE_URL` / DASHSCOPE Key / 镜像 tag）。
- `.gitignore` 补 `specs/.secrets`、`specs/.tmp`。
- `.env.example`（用户确认 diff 后）：`DATABASE_URL` 示例改 MySQL（ADR-005）；追加 2.0 键 `TWIN_REFRESH_CRON` / `TWIN_REFRESH_TTL_HOURS` / `MCP2_TRANSPORT` / `MCP2_PORT`（注释态）；其余行不动。
- 新建 `specs/knowledge/ops/secrets-file-gitignore-first.md` 与 README 索引。

**验收**：SSH 只读实测三容器健康（Up 29h，mcp healthy）；`git status` 不再显示 `specs/.tmp`；用户确认 OGT-1 可关闭与 `.env.example` 写入。

---

## 2026-10-19

### 更新 artifacts-map 与技术规格索引

**原因**：`sdd-audit-artifacts` 需 Usable；2.0 对外 MCP 需可打开的 function-spec。

**变更内容**：
- `artifacts-map.json`：五 process 文件、各模块 `*-function-spec.md`、`specs/mcp2.0/mcp2-function-spec.md`；移除不存在的 `specs/.secrets`。
- 新建 `specs/adr/`、`specs/knowledge/` 占位目录。

**验收**：审计打开 map 所列路径无 failed；`specs/.secrets` 不再出现在 map（密钥仍用 `.env` / `.env.example`）。

---

## 2026-10-19

### mcp2.0 工程三件套与 release.md

**原因**：审计与 Sprint 1 需要可打开的 design / stories / test；发布说明独立于 spec1.0。

**变更内容**：新增 `specs/mcp2.0/mcp2-design.md`、`mcp2-stories.md`、`mcp2-test.md`、`specs/release.md`；更新 `artifacts-map.json` 与 sprint-backlog `task-01` 引用。

**验收**：`sdd-audit-artifacts` 为 Usable。

---

## 2026-10-19

### 移除 mcp2-function-spec 索引

**原因**：2.0 对外 MCP 契约以 `product-backlog.md` 为准，不单独维护 `mcp2-function-spec.md`。

**变更内容**：删除 `specs/mcp2.0/mcp2-function-spec.md`；`artifacts-map.json` 中 `mcp2.0` 模块 `files` 为空。

**验收**：`sdd-audit-artifacts` 为 Usable。

---

## 2026-10-19

### 2.0 三轮 Sprint 排期（Sprint 1–3 Option A）

**原因**：用户确认 Sprint 1–3 均为 Option A；Sprint 1 增加对外 MCP 2.0 骨架 Task。

**变更内容**：
- `specs/product-backlog.md`：8 条 Implementable PBI 的 `Sprint` 列由 — 设为 Sprint 1 / 2 / 3。
- `specs/sprint-backlog.md`：新建 Sprint 1–3 段落与 SBI 表；Sprint 1 含 `task-01` 与三条 Feature SBI。
- `specs/status.md`：新建，当前 Sprint 1 ToDo。
- `specs/issues-log.md`：新建空表。

**验收**：`product-backlog.md` 与 `sprint-backlog.md` 中 PBI 与 SBI 一一对应；未排期 PBI 表为空。

**边界**：不含代码实现与 `artifacts-map.json` 索引更新。
