# 待办与后置项（ToDo）

> as_of：2026-07-20  
> 用途：记录**已降级出验收门槛**、或**尚未做完**的能力，避免与「本批已闭环」混淆。  
> 权威功能表仍以各 `*-function-spec.md` 为准；本文件只跟进缺口。  
> 栈/架构与实现的对照已写入 [`3.architecture.md`](./3.architecture.md)、[`4.install-dependencies.md`](./4.install-dependencies.md)（as_of 同日）。  
> **优先级**：下列未完项一律标为 **LOW PRIORITY**（不挡 MVP-1…4 闭环与 UAT）。

---

## 1. MVP-3 已降级（不再当作本批缺口）

下列项规格已改写为「小模型 / 轻量异步 / fixture 优先」；**不阻塞 MVP-3 验收**。升级项见 §2（均为 LOW PRIORITY）。

| 原期望 | 现行验收默认 | 升级去向 |
|--------|--------------|----------|
| Embedding = BGE-M3 | 进程内 `bge-small-zh`（Xenova） | F-RAG-004/007† |
| Rerank = bge-reranker-v2-m3 | 进程内 `bge-reranker-base` | F-RAG-004/007† |
| BullMQ 任务队列 | 进程内异步 + 同专科互斥 | F-RAG-019† |
| 完整 NCBI 配额管线 | fixture / 摘要路径 + 版权底线（不存闭源全文） | F-RAG-020† |
| 学术全文按 section 切块 | 摘要/fixture 整段切块 | F-RAG-012† |

---

## 2. LOW PRIORITY 未完清单

| 编号 | 类型 | 功能名称 | 说明 | 优先级 |
|------|------|----------|------|--------|
| F-WEB-034 | app | Agent 流式回复 | P0 非流式 + typing 已交付；SSE 未做 | LOW PRIORITY |
| F-WEB-043 | app | 鉴权与租户上下文 | 规格为「若启用」；登录/租户绑定未落地 | LOW PRIORITY |
| F-MCP-028 | mcp | 热力监控节奏 | 有 `poll_heatmap` / `last_polled_at`；缺每日/会前定时扫描 | LOW PRIORITY |
| F-MCP-021† | mcp | 文献源 P1（Europe PMC / Crossref） | 活跃源为 ORCID/PubMed/OpenAlex；P1 互补源未接 | LOW PRIORITY |
| F-MCP-027† | mcp | 异步任务与 Redis 队列 | 进程内队列已用；Redis/多实例队列未做 | LOW PRIORITY |
| F-AGT-022 | agent | 流式输出 | `chatStream` → BFF SSE 未实现（对齐 F-WEB-034） | LOW PRIORITY |
| F-AGT-024 | agent | 租户产品上下文 | 适应症/SOP 租户上下文未完整接入 | LOW PRIORITY |
| F-RAG-020† | rag | PubMed/NCBI 正式拉取管线 | 现行 fixture/摘要优先；完整配额/限速/重试待补 | LOW PRIORITY |
| F-RAG-012† | rag | 学术按章节切块 | 现行整段切块；section 切块为增强 | LOW PRIORITY |
| F-RAG-004/007† | rag | Embedding / Rerank 升级 | 现行小模型可验收；更大模型为后置 | LOW PRIORITY |
| F-RAG-019† | rag | BullMQ 灌库队列 | 现行进程内异步；多实例再上 | LOW PRIORITY |
| F-RAG-021 | rag | 租户 SOP 入库 | 规格已标后置；`upsert_tenant_sop` 未做 | LOW PRIORITY |
| F-RAG-022 | rag | Parent-Document | 规格已标后置 | LOW PRIORITY |
| F-RAG-025 | rag | Eval 回归 | 规格已标后置；缺 eval-set 与回归脚本 | LOW PRIORITY |

† MVP 底线已用降级方案满足验收；表中为增强/生产补齐部分。

历史 ID 对照：`TD-RAG-01`…`07` 分别对应上表 F-RAG-020† / 012† / 004·007† / 019† / 021 / 022 / 025。

---

## 3. 产品剩余批次（相对整库）

| 批次 | 状态 | 剩余要点 |
|------|------|----------|
| **MVP-1** Twin 工作台 | 近闭环 | 正式 UAT / 用户验收收口 |
| **MVP-2** 洞察工作台 | 近闭环 | 正式 UAT；导航改版后文档中个别旧表述核对 |
| **MVP-3** 知识库 | 近闭环 | §2 LOW PRIORITY 增强项不挡验收；正式 UAT |
| **MVP-4** Engagement | 近闭环 | 正式 UAT；SSE / 鉴权等见 §2 LOW PRIORITY |

---

## 4. MVP-4 已交付摘要（对照）

| 域 | 编号摘要 | 状态 |
|----|----------|------|
| Web | F-WEB-026–033、038 等 | 已实现：选项卡、生成、闸门、页底修订、通用 Agent Tab、本机历史、typing/Enter、附件元数据、resize |
| Agent | F-AGT-002–007、011–021、023、025–027 等 | 已实现：`proposeOptions`、双路 retrieve、闸门、`revise_engagement`、`chat` mode 隔离 |
| 流式 / 鉴权 / 租户 | F-WEB-034、043 · F-AGT-022、024 | **LOW PRIORITY**（见 §2） |
| RAG 后置 | F-RAG-021/022/025 及 † 增强 | **LOW PRIORITY**（见 §2） |

---

## 5. 明确不做（全产品）

- 正式 MLR 电子签、CRM 回写、自动办会  
- 全科 / 全 PubMed 预灌、知网无授权爬取  
- 浏览器直连 Qdrant / LLM Key  
- 医院/科室强制音译英文化；next-intl / URL locale（界面 i18n 用自定义 catalog + 叙事分桶）

---

## 6. 近期已闭环（对照，非缺口）

| 主题 | 说明 | 文档 |
|------|------|------|
| F-WEB-046 叙事双语 | Insights `locales` + Options `locale`；切语言互不覆盖 | [`docs/adr/ADR-001-…`](../docs/adr/ADR-001-bilingual-narrative-buckets.md) |
| F-WEB-047 name_en | 仅拉丁；CJK 当空；拼音检索 OpenAlex 拉丁簇 | [`docs/adr/ADR-002-…`](../docs/adr/ADR-002-latin-name-en-openalex.md) |
| 运维课 | 分桶 / 回填 / `translate:en` | [`knowledge/…/bilingual-narrative-and-name-en.md`](../knowledge/hcp-twin-data-entity/bilingual-narrative-and-name-en.md) |

---

## 相关文档

- RAG 功能：[`rag/rag-function-spec.md`](./rag/rag-function-spec.md)  
- App / MCP / Agent：各 `*-function-spec.md`（对应行已标 LOW PRIORITY）  
- 产品 MVP：[`1.product-definition.md`](./1.product-definition.md)  
- 依赖：[`4.install-dependencies.md`](./4.install-dependencies.md)  
- ADR：[`docs/adr/`](../docs/adr/)  

