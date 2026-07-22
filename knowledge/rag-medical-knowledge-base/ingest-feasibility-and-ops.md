---
title: RAG 知识灌注研究结果（可行性与运维）
type: research-synthesis
status: active
as_of: 2026-07-17
tags:
  - medical-knowledge-base
  - rag
  - ingest
  - on-demand
  - compliance
  - feasibility
related_spec: specs/rag/rag-design.md
related:
  - knowledge/rag-medical-knowledge-base/on-demand-ingest.md
  - knowledge/rag-medical-knowledge-base/content-acquisition.md
  - knowledge/rag-medical-knowledge-base/rag-architecture.md
  - specs/rag/rag-function-spec.md
  - specs/3.architecture.md
---

# RAG 知识灌注研究结果

> 基准日：**2026-07-17**  
> 问题：学术 / 合规知识能否自动灌注？产品侧如何触发？运维如何手灌合规？  
> 结论已落入规格：[`specs/rag/rag-design.md`](../../specs/rag/rag-design.md)（ADR-06：不做全科预灌）。

## 1. 一句话结论

| 索引 | 能否自动 | 研究结论 |
|------|----------|----------|
| `academic_index` | **能（按需）** | Twin 确认保存且专科可归一化后，异步 `ingest_on_demand`；同专科缓存复用 |
| `compliance_index` | **不能按病种自动** | 合法取得原文后 **手动策展** → 按条款切块 → `seed_compliance` |
| 租户 SOP | **不能自动爬** | 人工上传 → `upsert_tenant_sop` + `tenant_id` 隔离 |
| 全科 / 全 PubMed | **不做** | 贵、噪声大、难审计；产品定义中的「全科」实现上修正为按专科按需 |

```text
合规种子（手动，一次/版本变更）──► compliance_index
Twin specialty/themes（自动按需）──► academic_index
        │
        ▼
Agent：retrieve_academic ‖ retrieve_compliance（强制 citation）
```

## 2. 可行性矩阵（研究结论）

| 能力 | 可行？ | 依据 |
|------|--------|------|
| 新专科（如唐氏综合征）学术知识按需入库 | **是** | 公开 API（PubMed / OpenAlex）+ MeSH 归一化 + coverage |
| 同专科第二次 Twin 跳过全量重灌 | **是** | coverage `ready` 幂等 |
| 合规条文随病种自动爬取 | **否** | 版权、版本、条款语义不可靠；须策展 |
| 合规 PDF 一次合法取得后手灌向量 | **是** | 目录 + `chunks.jsonl` + `seed_compliance` |
| 浏览器直连 Qdrant / 托管向量 SaaS 默认 | **否** | 数据驻留与密钥边界 |
| pgvector 作主向量库 | **否（P0）** | 业务主库已是香港 Postgres；向量仅 Qdrant |
| Agent 直写 Qdrant | **否** | 仅 medical-kb；Agent 可建议补灌 |

## 3. 学术自动灌注：产品触发（已定）

与早期「创建 Twin」抽象触发对齐为 **确认并保存分身**（消歧 `resolved`）：

```text
Web「确认并保存」
  → BFF 写 Twin（香港 Postgres）
  → F-WEB-039：ingest_on_demand({ specialty, themes?, hcpId, force? })
  → 立即返回 { jobId, knowledge_status }
  → 异步：归一化 → coverage → 拉公开源 → 落盘 corpus/academic/{specialty}/
       → 切块 → embed → upsert academic_index
       → Postgres ingest_manifest + Twin knowledge_status
```

### 触发条件（全部满足）

1. 分身已确认保存（或 `disambiguation_status=resolved`）  
2. 存在可归一化的 `specialties[]` / `themes[]`  
3. 无同 key 进行中的 job（否则 `INGEST_IN_PROGRESS`）  
4. 非 `force` 时 coverage 已 `ready` → **跳过**

### 不触发

- 仅浏览列表、未确认  
- `needs_review` / 未绑定活跃 AuthorIds  
- 合规索引、租户 SOP  

### 状态

`pending | ready | sparse | failed` — Agent 在 `sparse`/`pending` 时弱建议，不编造「已入库」证据。

样例流（唐氏综合征）见 [on-demand-ingest.md](./on-demand-ingest.md)。

## 4. 合规手动注入：运维研究结果

适用：已合法取得 RDPAC、《医药代表管理办法》摘要、IFPMA 摘要等可入库文本。  
**不**代下载版权受限全文；**不**按病种自动爬合规。

| 步 | 动作 | 产出 |
|----|------|------|
| 1 | 确认 `authority` / `version` / `effective_date` / `jurisdiction=CN` | 元数据 |
| 2 | 原文放入 `data/rag/corpus/compliance/{authority}/{version}/` | 源文件（gitignore） |
| 3 | **按条款切块**（禁止整 PDF 一块） | `chunks.jsonl` |
| 4 | 自检：条款号唯一、无统方/回扣教唆、无客户机密 | checklist |
| 5 | `seed_compliance` | Qdrant + Postgres manifest |
| 6 | `retrieve_compliance` 抽测敏感互动问法 | 命中含 `clause_id` |

切块与质检提示词、抽检问法：规格 [`rag-design.md`](../../specs/rag/rag-design.md) §4.3（知识库不重复长 prompt，以免双源漂移；以规格为执行稿）。

客户 SOP：`corpus/tenants/{tenantId}/sop/` → `upsert_tenant_sop`。

## 5. 数据驻留（与灌注相关）

| 资产 | 位置 |
|------|------|
| Twin / Options / Session / ingest_manifest | **香港 Postgres**（`DATABASE_URL`） |
| 语料源文件暂存 | `data/rag/corpus/{academic,compliance,tenants/**}` |
| 向量 | 本地/内网 Qdrant（`data/qdrant/`）；默认非公网 |

拉取公开源后 **先落盘再 embed**；失败不把语料缓存在第三方永久库。

## 6. 与周边边界

| 系统 | 灌注相关职责 |
|------|----------------|
| Web BFF | F-WEB-039 触发；轮询 status；不直连 Qdrant |
| medical-kb | ingest / seed / retrieve；唯一写向量入口 |
| hcp-engagement-agent | 只调 `retrieve_*`；不写索引 |
| hcp-twin-mcp | 产出 specialty/themes；不灌专科指南全文 |

## 7. 验收锚点（研究建议）

- [ ] 朱同玉确认保存 → 按肾移植/噬菌体等主题可触发 academic ingest（或 coverage 跳过）  
- [ ] 新专科「唐氏」→ job → 可按 `specialty` 检索  
- [ ] 同专科第二次 Twin 不重复全量灌  
- [ ] 合规仅手灌后可引用；与病种无关  
- [ ] 跳过 `retrieve_compliance` 的提案路径应失败/降级（Agent 侧）  

## 8. 相关规格与旧研究

| 文档 | 角色 |
|------|------|
| [rag-design.md](../../specs/rag/rag-design.md) | 技术设计（触发、手灌、Hybrid） |
| [rag-function-spec.md](../../specs/rag/rag-function-spec.md) | F-RAG / I-RAG |
| [on-demand-ingest.md](./on-demand-ingest.md) | 按需行为矩阵与唐氏样例 |
| [content-acquisition.md](./content-acquisition.md) | 学术/合规来源分层 |
| [rag-architecture.md](./rag-architecture.md) | 双索引 + Hybrid 架构 |
