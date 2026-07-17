# 待办与后置项（ToDo）

> as_of：2026-07-18  
> 用途：记录**已降级出验收门槛**、或**尚未做完**的能力，避免与「本批已闭环」混淆。  
> 权威功能表仍以各 `*-function-spec.md` 为准；本文件只跟进缺口。

---

## 1. MVP-3 已降级（不再当作本批缺口）

下列项规格已改写为「小模型 / 轻量异步 / fixture 优先」；**不阻塞 MVP-3 验收**。

| 原期望 | 现行验收默认 | 升级去向 |
|--------|--------------|----------|
| Embedding = BGE-M3 | 进程内 `bge-small-zh`（Xenova） | 换更大模型 / 内网 embedding 服务 |
| Rerank = bge-reranker-v2-m3 | 进程内 `bge-reranker-base` | 换 v2-m3 或等价 |
| BullMQ 任务队列 | 进程内异步 + 同专科互斥 | 多实例时再上 Redis/BullMQ |
| 完整 NCBI 配额管线 | fixture / 摘要路径 + 版权底线（不存闭源全文） | 见 §2 |
| 学术全文按 section 切块 | 摘要/fixture 整段切块 | 见 §2 |

---

## 2. 部分完成 → 后续补齐（知识库）

| ID | 事项 | 说明 | 建议时机 |
|----|------|------|----------|
| TD-RAG-01 | PubMed/NCBI 限速与重试 | 正式在线拉取时：API Key、配额、退避、失败可观测；仍只存摘要/OA | 生产前 |
| TD-RAG-02 | 学术全文 / 指南按章节切块 | 在摘要块之上支持 section 切块与 `authority` | 增强 |
| TD-RAG-03 | Embedding / Rerank 模型升级 | 配置切换到 BGE-M3 级 dense + 更强 rerank；对比召回质量 | 增强 |
| TD-RAG-04 | BullMQ `rag-ingest` | 多 Worker、持久化队列、崩溃恢复 | 多实例部署前 |
| TD-RAG-05 | 租户 SOP（F-RAG-021） | 同 compliance_index + `tenant_id` 隔离 | 规格已标后置 |
| TD-RAG-06 | Parent-Document（F-RAG-022） | 小块召回、生成拉 parent | 规格已标后置 |
| TD-RAG-07 | Eval 回归集（F-RAG-025） | `data/rag/eval-set.json`，无客户 SOP 明文 | 规格已标后置 |

---

## 3. 产品剩余批次（相对整库）

| 批次 | 状态 | 剩余要点 |
|------|------|----------|
| **MVP-1** Twin 工作台 | 近闭环 | 正式 UAT / 用户验收收口 |
| **MVP-2** 洞察工作台 | 近闭环 | 正式 UAT；导航改版后文档中个别旧表述核对 |
| **MVP-3** 知识库 | 近闭环 | 本文件 §2；正式 UAT / commit |
| **MVP-4** Engagement | 近闭环 | 正式 UAT；可选 SSE 流式增强；F-WEB-042/043 横切按启用项验收 |

---

## 4. MVP-4 已交付摘要（对照）

| 域 | 编号摘要 | 状态 |
|----|----------|------|
| Web | F-WEB-026–034、038 | 已实现：选项卡、生成、闸门、页底修订、Agent Tab、历史 cookie、附件元数据、resize |
| Agent | F-AGT-002–007、011–027 等 | 已实现：`proposeOptions`、双路 retrieve、闸门、`revise_engagement`、`chat` mode 隔离 |
| RAG（配合提案） | F-RAG-021/022/025 | **仍后置**（见 §2） |
| 流式 | F-WEB-034 / F-AGT-022 | P0 非流式 + 每轮落库；SSE 可选增强 |

---

## 5. 明确不做（全产品）

- 正式 MLR 电子签、CRM 回写、自动办会  
- 全科 / 全 PubMed 预灌、知网无授权爬取  
- 浏览器直连 Qdrant / LLM Key  

---

## 相关文档

- RAG 功能：[`rag/rag-function-spec.md`](./rag/rag-function-spec.md)  
- 产品 MVP：[`1.product-definition.md`](./1.product-definition.md)  
- 依赖：[`4.install-dependencies.md`](./4.install-dependencies.md)  
