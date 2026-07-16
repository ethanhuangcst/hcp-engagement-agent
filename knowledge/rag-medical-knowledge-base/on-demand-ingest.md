---
title: medical-knowledge-base 按需自动灌注
type: architecture-decision
status: active
as_of: 2026-07-16
tags:
  - medical-knowledge-base
  - rag
  - on-demand-ingest
  - specialty-coverage
related_spec: specs/initial.req.md
related:
  - knowledge/medical-knowledge-base/rag-architecture.md
  - knowledge/medical-knowledge-base/content-acquisition.md
---

# 按需自动灌注（On-Demand Specialty Ingest）

## 结论

学术知识灌注应做成 **「Twin → specialty → coverage check → 异步 ingest」** 的按需自动能力。  
这不是向量库自带功能，需产品显式实现。

合规知识 **不按病种自动拉取**（全局种子 + 客户 SOP 上传）。

## 行为矩阵

| 场景 | 是否自动 | 说明 |
|------|----------|------|
| 新建 Twin，专科已在库且覆盖充足 | 否（跳过 ingest） | 直接按 `specialty` 过滤检索 |
| 新建 Twin，专科缺失或覆盖不足（如唐氏综合征） | **是** | 异步 specialty ingest |
| 合规（RDPAC 等） | 否 | 预置种子库，与病种无关 |
| 客户 SOP / 闭源指南 PDF | 否 | 人工/租户上传 |

模式：**按需 ingest + 按专科缓存**——首次自动建库，同专科后续 Twin 复用。

## 触发流（样例：唐氏综合征）

```text
创建 HCP Twin（专科 = Down syndrome / 遗传学 / 儿科学）
        │
        ▼
  specialty normalize（别名 → MeSH/标准标签）
        │  例：「唐氏」→ Down Syndrome[MeSH] → specialty=down_syndrome
        ▼
  coverage check：该 specialty 的 chunk 数 / 近3年文献数
        │
        ├─ 充足 → knowledge_status=ready，跳过 ingest
        └─ 不足 → 异步 job：
              1. PubMed: "Down Syndrome"[MeSH] + 近3–5年
                 + Guideline / Systematic Review / Evidence Synthesis 优先
              2. 公开指南 PDF（卫健委/学会/国际，若有）
              3. 切块、embedding、写入 academic_index
              4. knowledge_status → ready | sparse
```

## Twin / Agent 状态字段

```text
knowledge_status: pending | ready | sparse | failed
knowledge_specialty: down_syndrome
knowledge_job_id: optional
knowledge_updated_at: ISO-8601
```

规则：

1. **异步**：创建 Twin 立即返回；不阻塞等灌库完成  
2. **覆盖度门槛**：例如「近 3 年 Review/Guideline ≥ N」才算 `ready`  
3. **消歧**：必须经 MeSH/标准标签映射，禁止仅用自由文本当 query  
4. **限流与版权**：摘要 + OA 全文；PubMed quota；失败可重试  
5. **Agent**：`sparse` / `pending` 时弱建议，并提示「知识库仍在构建」

## 与全库预灌 / 纯在线检索对比

| 方式 | 新建「唐氏」Twin |
|------|------------------|
| 全库预灌 | 可能已有，但贵、噪声大 |
| **按需自动 + 缓存（推荐）** | 首次拉取并缓存；下次复用 |
| 纯在线不入库 | 每次问 PubMed，慢、难审计 |

## 能力边界

| 具备 | 不具备（除非另做） |
|------|-------------------|
| 新医学领域学术知识自动发现与入库 | 保证抓到该国「最新」闭源指南 PDF |
| 同专科缓存复用 | 按病种自动扩展合规章节 |
| coverage / status 可观测 | 自动购买知网等付费全文 |

## 验收标准（建议）

- [ ] 新建专科为「唐氏综合征」的 Twin → 自动产生 ingest job  
- [ ] job 完成后 `academic` 可按 `specialty=down_syndrome` 检索到文献/指南 chunk  
- [ ] 第二次同专科 Twin **不重复全量灌库**（coverage 命中）  
- [ ] 合规检索结果与病种无关，仍返回 RDPAC 等全局条文  
- [ ] `pending` 期间 Agent 不编造该专科「已入库」证据
