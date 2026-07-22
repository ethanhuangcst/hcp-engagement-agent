---
title: medical-knowledge-base 知识内容获取
type: research-synthesis
status: active
as_of: 2026-07-17
tags:
  - medical-knowledge-base
  - rag
  - pubmed
  - compliance
  - content-acquisition
related_spec: specs/rag/rag-design.md
related:
  - knowledge/rag-medical-knowledge-base/rag-architecture.md
  - knowledge/rag-medical-knowledge-base/on-demand-ingest.md
  - knowledge/rag-medical-knowledge-base/ingest-feasibility-and-ops.md
---

# medical-knowledge-base 知识内容获取

规格两类内容：**专科前沿学术** + **HCP Engagement 合规**。  
不做「全网全科百科」；按 Twin 专科按需拉取（见 on-demand-ingest / ingest-feasibility-and-ops）。

## 1. 学术知识

| 层级 | 来源 | 获取方式 | 用途 |
|------|------|----------|------|
| P0 文献索引 | PubMed / MEDLINE | NCBI E-utilities；或 PubMed Baseline FTP + 日更 | 摘要、MeSH、发表类型 |
| P0 元数据对齐 | OpenAlex | 公开 API；与 DOI/PMID 归并 | 作品列表、OA 链接辅助 |
| P0 全文（合法 OA） | PMC OA、Unpaywall、bioRxiv/medRxiv | API / OA 子集；闭源只存摘要+DOI | 深度证据 |
| P0 指南 | 卫健委诊疗规范、中华医学会指南、WHO/NICE/KDIGO 等 | 官网 PDF 入库 | 「标准说法」优先于单篇论文 |
| P1 试验 | ClinicalTrials.gov | 公开 API | 在研与 unmet need（旁证） |
| P1 综述过滤 | MeSH：Guideline / Systematic Review / Evidence Synthesis | PubMed 字段过滤 | 降噪 |
| P2 中文文献 | 万方/知网等（需授权） | 机构订阅或人工导入 | **无授权不做全量爬** |

### 专科触发样例（朱同玉）

- `Kidney Transplantation[MeSH]`（近 3–5 年）
- Bacteriophage Therapy / MDR infection
- BK virus / polyomavirus nephropathy
- 中国肾移植 / 器官移植相关指南与质控文件

### 刷新

- 指南：事件驱动 / 手灌版本
- 文献：按专科按需 ingest 后缓存（非全库周扫）
- 禁止一次性「全科」embedding

### 落盘约定（2026-07-17）

拉取后先写入 `data/rag/corpus/academic/{specialty}/`，再 embed 入 Qdrant；manifest 元数据写香港 Postgres。

## 2. 合规知识

| 优先级 | 文档 | 获取 |
|--------|------|------|
| P0 中国行业 | RDPAC《行业行为准则》 | 官方 PDF，按条款切块后 **seed_compliance** |
| P0 中国法规 | 《医药代表管理办法》（2026-08-01 施行）等摘要 | 公开文本；**手灌**，不按病种爬 |
| P0 国际 | IFPMA；PhRMA Code；EFPIA | 协会官网 PDF |
| P0 其它 | 《药品管理法》《广告法》、反不正当竞争相关公开文本 | 公开法律文本 |
| P1 企业私有 | 客户 SOPs、合规手册 | **客户上传**，租户隔离 |
| P2 解读 | 律所/协会解读 | 仅辅助，标注非权威 |

合规库以**人工策展 + 版本号 + 生效日**为主，**不按病种自动爬虫**。  
手灌步骤与提示词见规格 [`rag-design.md`](../../specs/rag/rag-design.md) §4；可行性总述见 [ingest-feasibility-and-ops.md](./ingest-feasibility-and-ops.md)。

参考链接：

- RDPAC：https://www.ifpma.org/wp-content/uploads/2022/12/RDPAC_Code-of-Practice_2023.pdf
- PhRMA：https://www.phrma.org/resources/code-on-interactions-with-health-care-professionals

## 3. Chunk 元数据（入库必带）

```text
doc_type: guideline | paper | trial | compliance | sop
specialty: ...          # academic
jurisdiction: CN | US | EU | global
authority: nhc | cma | pubmed | rdpac | client
as_of / version / source_url / license
clause_id / tenant_id   # compliance / SOP
```

## 4. 系统边界

| 系统 | 存什么 | 不存什么 |
|------|--------|----------|
| hcp-twin-mcp | 该 HCP 履历、论文列表、活动 | 全专科指南全文 |
| medical-kb | 专科证据 + 合规条文（Qdrant + corpus） | 非公开拜访/隐私 |
| hcp-engagement-agent | 检索两者后生成建议 | 未检索到的合规当「允许」 |

## 5. 监控项

- 合规 PDF 版本变更
- 专科指南新版
- PubMed / OpenAlex 按需 ingest 任务失败率与 `knowledge_status`
