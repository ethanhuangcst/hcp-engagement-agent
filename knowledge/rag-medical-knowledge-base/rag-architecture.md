---
title: medical-knowledge-base RAG 推荐架构
type: architecture-decision
status: active
as_of: 2026-07-17
tags:
  - medical-knowledge-base
  - rag
  - qdrant
  - langgraph
  - dual-index
related_spec: specs/rag/rag-design.md
related:
  - knowledge/rag-medical-knowledge-base/content-acquisition.md
  - knowledge/rag-medical-knowledge-base/on-demand-ingest.md
  - knowledge/rag-medical-knowledge-base/ingest-feasibility-and-ops.md
---

# medical-knowledge-base RAG 推荐架构

## 结论

采用 **双索引 + 专科元数据过滤 + Hybrid 检索**；Agent 侧用薄 LangGraph 编排双路检索与生成。  
不做单一「全科医学」向量库预灌（ADR-06）。

```text
HCP Twin (specialty, themes)
        │
        ▼
┌───────────────────────────────────────────┐
│  medical-kb (dual index)                  │
│  A. academic_index   B. compliance_index  │
└───────────────┬───────────┬───────────────┘
                │           │
         parallel retrieve (filtered)
                ▼           ▼
           rerank      clause-aware
                \       /
         Agent LangGraph merge / gate
                     │
                     ▼
           Engagement Options + citations
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
| 检索包 | `@hca/medical-kb` | ingest + retrieve；不生成 Options |
| 编排（生成） | Agent 薄 LangGraph | 双路并行 → gate → generate |
| 向量库 | **Qdrant**（本地/内网） | 过滤强、可 hybrid、数据驻留 |
| 业务元数据 | **香港 Postgres** | Twin / manifest / jobs；**不用** pgvector 作主向量 |
| Embedding | **BGE-M3** | 中英混合；可出 sparse |
| 稀疏检索 | BM25 | MeSH、药名、准则条款号 |
| 融合 | RRF（dense ~0.7 + sparse ~0.3） | 医学检索标配 |
| Rerank | bge-reranker-v2-m3 | 召回池 → top-5 |
| 切块 | 合规按条款；摘要整段；全文按 section | Parent-Document 为 P2 |

**不优先：** 公有云向量 SaaS 默认；一次性全 PubMed 灌库；学术/合规混库。

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

## Agent 检索图（消费方）

```text
START
  → get_twin_insights
  → retrieve_academic ‖ retrieve_compliance
  → compliance_gate
  → propose_engagement_options   # 必须列出 citations
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
| medical-kb | 证据与规则；双索引 RAG；唯一写向量 |
| hcp-engagement-agent | 调 retrieve + 生成个性化方案 |
| Web BFF | F-WEB-039 触发 academic 按需灌注 |

## 落地分期（与产品 MVP 对齐）

| MVP | 交付 | 验收 |
|-----|------|------|
| MVP-4 | 本地 corpus + Qdrant + compliance 种子 + retrieve | 条款可引用 |
| MVP-5 | Hybrid academic + ingest_on_demand | 朱同玉/新专科 |
| MVP-7 | 租户 SOP + eval | 隔离与回归 |

按需灌注见 [on-demand-ingest.md](./on-demand-ingest.md)；可行性总述见 [ingest-feasibility-and-ops.md](./ingest-feasibility-and-ops.md)。  
执行规格：[`specs/rag/rag-design.md`](../../specs/rag/rag-design.md) · 产品 MVP：[`specs/1.product-definition.md`](../../specs/1.product-definition.md)。
