---
title: medical-knowledge-base RAG 推荐架构
type: architecture-decision
status: active
as_of: 2026-07-16
tags:
  - medical-knowledge-base
  - rag
  - qdrant
  - langgraph
  - dual-index
related_spec: specs/initial.req.md
related:
  - knowledge/medical-knowledge-base/content-acquisition.md
  - knowledge/medical-knowledge-base/on-demand-ingest.md
---

# medical-knowledge-base RAG 推荐架构

## 结论

采用 **双索引 + 专科元数据过滤 + Hybrid 检索 + LangGraph 编排**。  
不做单一「全科医学」向量库预灌。

```text
HCP Twin (specialty, themes)
        │
        ▼
┌───────────────────────────────────────────┐
│  medical-knowledge-base (dual index)      │
│  A. academic_index   B. compliance_index  │
└───────────────┬───────────┬───────────────┘
                │           │
         parallel retrieve (filtered)
                ▼           ▼
           rerank      clause-aware
                \       /
              LangGraph merge
                     │
                     ▼
           hcp-engagement-agent
           (学术建议 + 合规约束 + 引用)
```

## 需求映射

| 规格需求 | 设计 |
|----------|------|
| 医生对应专业的最前沿学术资料 | Twin `specialty/themes` → 按需 ingest + 检索过滤 |
| HCP Engagement 合规文件 | 独立 `compliance` 索引；生成时强制检索 |
| 中英医学文本 | 多语 embedding + BM25 |
| 可引用、可审计 | chunk 带 source/version/as_of；答案强制 citation |
| 客户 SOP | `tenant_id` 隔离 |

## 技术栈

| 层 | 选择 | 原因 |
|----|------|------|
| 编排 | LangGraph | 学术/合规双路并行 → 合并 → 生成；易加合规 gate |
| 向量库 | **Qdrant**（主推） | 过滤强、可 hybrid、可自托管（数据驻留） |
| 备选 | pgvector | Twin JSON + 向量同落 Postgres 时 |
| Embedding | **BGE-M3**（首选）或 multilingual-e5-large | 中英混合；BGE-M3 可出 sparse |
| 稀疏检索 | BM25 | MeSH、药名、准则条款号 |
| 融合 | RRF / Ensemble（dense ~0.7 + sparse ~0.3） | 医学检索标配 |
| Rerank | bge-reranker-v2-m3 或 Cohere Rerank | Top-20 → Top-5 |
| 切块 | 合规按条款；文献摘要整段 + 全文按 section；Parent-Document | 小块召回、大块生成 |
| Dev | Qdrant Docker（原型可用 Chroma） | 上线仍用 Qdrant |

**不优先：** 单一 Pinecone + 只 dense；一次性全 PubMed 灌库。

## 双索引元数据

### A. academic

```text
doc_type: guideline | paper | trial
specialty: kidney_transplant | phage_therapy | down_syndrome | ...
language: zh | en
year, mesh[], pmid/doi, source_url, license, authority
```

### B. compliance

```text
doc_type: industry_code | regulation | client_sop
jurisdiction: CN | US | EU | global
authority: rdpac | ifpma | phrma | nhc | client
version, effective_date, tenant_id, clause_id
```

检索过滤示例（朱同玉）：

```text
academic: specialty IN (kidney_transplant, phage, bk_virus) AND year >= 2021
compliance: jurisdiction IN (CN, global) AND tenant_id IN (null, current_tenant)
```

## Agent 检索图

```text
START
  → build_queries(Twin insights)
  → retrieve_academic ‖ retrieve_compliance
  → rerank_each
  → compliance_gate          # 无合规命中则降级/拒答敏感建议
  → generate_engagement      # 必须列出 citations
  → END
```

生成约束：

- 学术仅用于话题 / 证据 / unmet need
- 互动形式必须被合规 chunk 支持，否则标注「需人工合规确认」
- 每条建议附 `academic_refs[]` + `compliance_refs[]`

## 与周边系统边界

| 系统 | 职责 |
|------|------|
| hcp-twin-mcp | 人（履历/论文列表/活动）；不存全专科指南 |
| medical-knowledge-base | 证据与规则；双索引 RAG |
| hcp-engagement-agent | 编排检索 + 生成个性化方案 |

## 落地分期

| Phase | 交付 | 验收 |
|-------|------|------|
| P0 | compliance 索引 + RDPAC/IFPMA + 强制检索 | 建议带合规引用 |
| P1 | academic：按 Twin 专科 PubMed + 指南 | 话题对齐 Twin themes |
| P2 | Hybrid + rerank + Parent-Document | 条款级合规问答准确 |
| P3 | 租户 SOP、周增量、评估集 | 可上测试环境 |

按需自动灌注见 [on-demand-ingest.md](./on-demand-ingest.md)。
