# medical-kb 设计：双索引 RAG 与灌注

> as_of：2026-07-17  
> 规格：[`rag-function-spec.md`](./rag-function-spec.md) · 架构 §5.3 · 安装 §6  
> 包：`@hca/medical-kb` · 向量：Qdrant · 元数据：远程 MySQL  
> 原则：**rag-implementation**（Hybrid + citation；禁止全科预灌、禁止混库）

## 1. 结论

| 索引 | 灌注方式 | 触发 |
|------|----------|------|
| `compliance_index` | **手动策展**一次（版本变更再灌） | 运维：`seed_compliance` |
| `academic_index` | **自动按需** | Twin 确认后 BFF F-WEB-039 → `ingest_on_demand` |
| 租户 SOP | **手动上传** | `upsert_tenant_sop` |

禁止：全科/全 PubMed 预灌；按病种自动爬合规；浏览器直连 Qdrant；学术与合规混 collection；pgvector 作主向量库。

```text
合规种子（手动）──► compliance_index
Twin specialty/themes（自动）──► academic_index
        │
        ▼
Agent：retrieve_academic ‖ retrieve_compliance（强制 citation）
```

检索：dense（MVP-3 默认进程内小模型）+ BM25 → RRF（~0.7 / 0.3）→ 进程内小 rerank → top-5；更大模型见 [`../ToDo.md`](../ToDo.md)。

**实现注记（2026-07-18）**：`@hca/medical-kb` 已导出 `ingestOnDemand` / `getIngestStatus` / `retrieveAcademic` / `coverageCheck` / `normalizeSpecialty`；fixtures 位于 `packages/medical-kb/fixtures/academic/{specialty}/chunks.jsonl`。Web BFF：`POST /api/rag/ingest`、`GET /api/rag/ingest/status`；Twin 确认路由 fire-and-forget 触发 ingest 并在响应中带 `knowledge_jobs`。Agent 包 `retrieveAcademicForAgent` / `retrieveComplianceForAgent` 为 validation + 转发薄层。

---

## 2. 系统边界

| 做 | 不做 |
|----|------|
| ingest / Hybrid 检索 / citation 出参 | Twin 采集（MCP）、Engagement 生成（Agent） |
| corpus 落盘 + Qdrant upsert + Postgres manifest | 浏览器直连、公有云向量 SaaS（默认） |
| specialty 归一化、coverage、异步 job | 知网/万方无授权爬取 |

```text
BFF / Agent ──► medical-kb API ──► Qdrant（向量）
                      │
                      ├─► Postgres（ingest_manifest / job）
                      └─► data/rag/corpus（源文件暂存）
```

LangGraph 双路编排在 **Agent**；本包只提供 `retrieve_*` / `ingest_*`，不做 Options 生成。

---

## 3. 自动灌注（学术）触发机制

### 3.1 触发条件（全部满足）

1. 用户完成「确认并保存」分身（或等价：`disambiguation_status=resolved` 且 Twin 已入库）  
2. Twin 含可归一化的 `specialties[]` 和/或 `themes[]`（Insights / profile）  
3. 该专科当前无进行中的同 key ingest job（否则返回 `INGEST_IN_PROGRESS`）  
4. 非 `force` 时：coverage 已为 `ready` 且窗口内未过期 → **跳过**（幂等）

### 3.2 调用链

```text
Web「确认并保存」
  → BFF 写 Twin（Postgres）
  → BFF F-WEB-039：POST /api/rag/ingest 或内联调用
       body: { specialty, themes?, hcpId, force? }
  → medical-kb.ingest_on_demand  → 立即返回 { jobId, knowledge_status }
  → 异步 job：
       归一化 specialty
       → coverage check
       → 拉公开源（PubMed / OpenAlex / 指南摘要；OA 优先）
       → 写入 data/rag/corpus/academic/{specialty}/
       → 切块 → embed → upsert academic_index
       → 更新 Postgres ingest_manifest + rag_ingest_jobs（knowledge_status）
       → （可选）BFF 联表展示；不写 Twin JSON
  → UI 可选轮询 get_ingest_status(jobId)
```

### 3.3 其它触发（可选，同 API）

| 触发 | 说明 |
|------|------|
| Twin 增量刷新后 themes 变化 | 再次 `ingest_on_demand`（去重） |
| 运维 `force=true` | 强制重灌该专科 |
| Agent 检测 `COVERAGE_SPARSE` | 可建议用户/BFF 补灌；**不**由 Agent 直写 Qdrant |

### 3.4 不自动触发

- 仅打开列表、未确认分身  
- `needs_review` / 未绑定活跃 AuthorIds  
- 合规索引、租户 SOP  

### 3.5 Coverage 与状态

| `knowledge_status` | 含义 |
|--------------------|------|
| `pending` | job 进行中 |
| `ready` | 近窗文献/指南 chunk 达门槛（可配；例：近 3 年 Review/Guideline ≥ N） |
| `sparse` | 有部分 chunk，不足门槛；Agent 弱建议并提示构建中 |
| `failed` | 拉取/灌库失败（可重试） |

同专科后续 Twin **复用**索引；仅 coverage 不足或 `force` 再灌。

---

## 4. 合规知识：一次性获取后的手动注入指南

适用：已合法取得 RDPAC《行业行为准则》、医药代表管理办法摘要、IFPMA 摘要等**可入库文本**（PDF/Markdown）。不负责代下载版权受限全文。

### 4.1 步骤

| 步 | 动作 | 产出 |
|----|------|------|
| 1 | 确认版本：文件名、`authority`、`version`、`effective_date`、`jurisdiction=CN` | 元数据表 |
| 2 | 原文放入 `data/rag/corpus/compliance/{authority}/{version}/`（gitignore 内容） | 源文件 |
| 3 | **按条款切块**（禁止整 PDF 一块）；每块含 `clause_id` + 原文 | `chunks.jsonl` 或分文件 |
| 4 | 自检：条款号唯一、无处方/统方教唆语、无客户机密 | checklist |
| 5 | 运行 `seed_compliance`（CLI 或内部 API I-RAG-005） | upsert Qdrant + manifest |
| 6 | `retrieve_compliance` 抽测 3 条敏感互动问法 | 命中含 clause_id |
| 7 | 记录 manifest：`doc_id / version / as_of / path` | Postgres |

客户 SOP：放入 `corpus/tenants/{tenantId}/sop/` → `upsert_tenant_sop`；检索强制 `tenant_id`。

### 4.2 目录约定

```text
data/rag/corpus/compliance/
  rdpac/202x-xx/
    source.pdf | source.md
    chunks.jsonl          # 一行一块，见下
```

`chunks.jsonl` 字段（示意）：

```json
{"clause_id":"RDPAC-x.x","text":"…","authority":"rdpac","version":"…","effective_date":"…","jurisdiction":"CN","as_of":"2026-07-17"}
```

### 4.3 提示词（人工 / Agent 辅助切块用）

**系统角色**

```text
你是医药合规语料编排助手。任务：把已提供的合规原文切成可向量入库的条款块。
只使用用户粘贴的原文，禁止编造条款号或改写法律含义。
输出 JSONL，每行一块。字段：clause_id, text, authority, version, effective_date, jurisdiction。
切块规则：一个条款号一块；保留原文用语；删除页眉页脚与目录噪声；不合并无关条款。
若原文无条款号，用「文件名-顺序号」并在 notes 标明「无官方条款号」。
不输出处方潜力、统方、回扣话术。完成后列出未能切块的段落清单。
```

**用户任务模板**

```text
authority: rdpac | ifpma | cn_med_rep_measures | other:___
version: ___
effective_date: ____-__-__
jurisdiction: CN

以下为合规原文（已获授权用于内部 RAG）：

<<<
（粘贴原文）
>>>

请输出 chunks.jsonl（仅 JSONL，无其它说明）。
```

**质检提示词**

```text
根据下列 JSONL，检查：1) clause_id 是否唯一；2) text 是否可追溯到原文；3) 是否误含营销话术或非合规内容。
列出问题列表；无问题回复 PASS。
```

**灌库后抽检问法（给人 / 测 retrieve）**

```text
1. 院内学术会议需要哪些前置条件？
2. 讲者费用应遵循什么原则？
3. 医药代表备案与禁止行为有哪些要点？
期望：返回 chunk 含 clause_id + source/version/as_of。
```

---

## 5. Qdrant 双 Collection

| Collection | 命名 | 向量 |
|------------|------|------|
| 学术 | `academic_index` 或 `academic_index_v{major}` | dense（维数随模型）；sparse 存 BM25 |
| 合规 | `compliance_index` 或 `compliance_index_v{major}` | 同上 |

- 版本化：大改切块/embedding 升 `v{major}`；ingest **可重建**，不原地破坏性迁移。  
- 持久化：`data/qdrant/` 或 Docker volume；默认监听 `127.0.0.1:6333`。  
- `VECTOR_BACKEND=qdrant-local`；改公有云须 ADR + 显式配置。

### 5.1 Payload（学术）

```text
id, text,
doc_type: guideline | paper | trial,
specialty, themes?, language, year,
pmid?, doi?, mesh[], source, source_url?, authority?,
version, as_of, license?,
corpus_path?
```

过滤示例（朱同玉）：`specialty IN (kidney_transplant, phage, …) AND year >= 2021`。

### 5.2 Payload（合规）

```text
id, text,
doc_type: industry_code | regulation | client_sop,
clause_id, jurisdiction, authority,
version, effective_date, as_of,
tenant_id?   # SOP 必填；全局种子为 null
```

过滤：`jurisdiction IN (CN, global) AND (tenant_id IS NULL OR tenant_id = current)`。

---

## 6. 切块策略

| 文档类型 | 切块 | 备注 |
|----------|------|------|
| 合规 / RDPAC | **按条款号** | 禁止整 PDF 一块；`clause_id` 必填 |
| 论文摘要 | **整段** | 一摘要一块 |
| 论文全文（OA） | **按 section** | Methods/Results 等；闭源不存全文 |
| 指南 | **按章节** | 标 `authority` |
| 租户 SOP | 按小节/编号 | payload 强制 `tenant_id` |

Parent-Document（小块召回、生成拉 parent）：**P2**，不进 MVP-3 闭环；可作为后置增强。

---

## 7. Hybrid 检索管线

```text
Query
  │
  ├─ academic_index
  │     filter: specialty / themes / year / language
  │     dense: 进程内小模型（可换） ‖  sparse: BM25（药名、MeSH、关键词）
  │     fuse: RRF（dense≈0.7, sparse≈0.3，可配）
  │     rerank: 进程内小模型（召回池 → top-5）
  │
  └─ compliance_index
        filter: jurisdiction=CN, tenant_id
        clause-aware（条款号进 sparse）+ dense
        RRF → rerank → top-5
```

| 参数 | P0 默认 |
|------|---------|
| `top_k` 出参 | 5 |
| 召回池（rerank 前） | 约 20（可配） |
| RRF 权重 | dense 0.7 / sparse 0.3 |
| Embedding | MVP-3 默认 Xenova `bge-small-zh`；可经 env 换更大模型 |
| Rerank | MVP-3 默认 Xenova `bge-reranker-base`；可关：仅 Hybrid |

出参统一 `RagChunk`（见功能规格）；`index` 字段标明 `academic` \| `compliance`。Agent 截断冗长 `text`，保留 citation 字段。

---

## 8. 学术内容获取（ingest 内）

| 源 | 用途 | 约束 |
|----|------|------|
| PubMed / NCBI | 摘要 + MeSH 查询 | `NCBI_API_KEY?`；限流；摘要优先 |
| OpenAlex | 作品元数据 / OA 链接 | 公开 API |
| 公开指南摘要 | 卫健委/学会/国际（若可合法取得） | 不爬知网/万方 |

流程：归一化 specialty → 组查询 → 拉取 → **先落** `corpus/academic/{specialty}/` → 切块 → embed → upsert → manifest。

版权：闭源不存全文；第三方仅作拉取源，不写回其侧永久库。

---

## 9. 专科归一化

```text
自由文本 / Twin themes
  → 别名表 + MeSH / 受控 specialty
  → specialty key（如 kidney_transplant, phage_therapy）
  → 禁止仅用未映射自由文本当 ingest query（SPECIALTY_UNRESOLVED）
```

朱同玉示例映射：器官移植 / 噬菌体 / BK 病毒等 → 受控标签后再过滤检索。

---

## 10. 对外 API（设计契约）

| API | 调用方 | 要点 |
|-----|--------|------|
| `retrieve_academic` | Agent | filter + Hybrid；无写副作用 |
| `retrieve_compliance` | Agent（提案**强制**） | 可空结果 → Agent gate；租户隔离 |
| `ingest_on_demand` | BFF F-WEB-039 | 立即返回 `jobId`；异步写 |
| `get_ingest_status` | BFF / UI | 按 jobId 或 specialty |
| `seed_compliance` | 运维 | 同版本幂等 |
| `upsert_tenant_sop` | 运维 / BFF | 路径 + payload `tenant_id` |
| `health` | BFF `/api/health` | qdrant + collections + `bind_safe` |

入参 Zod；错误码见功能规格（`QDRANT_UNAVAILABLE`、`TENANT_ISOLATION_VIOLATION`、`INGEST_IN_PROGRESS` 等）。

异步：同 specialty 互斥（进程内 + DB 状态）；BullMQ 属后置（多实例时），见 [`../ToDo.md`](../ToDo.md)。

---

## 11. Postgres 元数据（示意）

| 表 / 实体 | 用途 |
|-----------|------|
| `ingest_manifest` | doc_id、index、specialty?、version、as_of、corpus_path、chunk_count |
| `rag_ingest_jobs` | jobId、specialty、status（= knowledge_status）、progress、error、hcpId?；**权威状态源** |
| Twin | **不**在 Twin JSON / 数据字典写入 knowledge_*；列表展示由 BFF 联表 jobs；可选 `hcp_twins` 表级旁路列镜像（非 JSONB 文档字段） |

与 Twin 共用 `DATABASE_URL`。向量**不**进 Postgres。

---

## 12. 数据驻留与安全

```text
data/
├── rag/corpus/{academic,compliance,tenants/**}   # gitignore
├── rag/eval-set.json                             # 可选；无客户 SOP 明文
└── qdrant/                                       # 向量卷；gitignore
```

| 规则 | 要求 |
|------|------|
| Qdrant | 回环 / Docker internal；**绑定检查始终开启**；非本机须 `QDRANT_ALLOW_NON_LOCAL=true` |
| 访问 | 仅 medical-kb → Qdrant；浏览器永不直连 |
| 租户 | 物理目录 + **同一** compliance_index 上 payload `tenant_id`；跨租户拒绝；不分租户 collection |
| 日志 | 不打印完整 SOP / 大段合规正文 |
| Embedding | **默认进程内/内网**；云 API 只传切块、Key 仅服务端、须显式开启 |

---

## 13. 包结构

```text
packages/medical-kb/
  src/
    api/           retrieve_*, ingest_*, seed_*, health
    qdrant/        client、collection bootstrap、bind 校验
    embed/         embedding client（默认进程内小模型）
    sparse/        BM25
    retrieve/      hybrid + RRF + rerank（academic / compliance）
    chunk/         compliance_clauses.ts · academic_sections.ts
    ingest/        on_demand.ts · seed_compliance.ts · tenant_sop.ts
    specialty/     normalize + coverage
    db/            manifest / jobs（经 @hca/db）
```

依赖：`@qdrant/js-client-rest` · `@hca/domain` · `@hca/db` · embedding/rerank 客户端 · `zod`  
**无** Playwright、**无** Next UI。

---

## 14. 环境变量

`DATABASE_URL` · `QDRANT_URL`（默认 `http://127.0.0.1:6333`）· `VECTOR_BACKEND=qdrant-local` · `QDRANT_ALLOW_NON_LOCAL?` · `EMBEDDING_MODEL` · `RERANK_MODEL?` · `HCA_DATA_DIR?` · `NCBI_API_KEY?`

---

## 15. 验收与 Eval

| 项 | 标准 |
|----|------|
| 双库隔离 | 学术 query 不命中合规条款块；反之亦然 |
| 合规引用 | 抽检问法命中含 `clause_id` + version/as_of |
| 朱同玉 / 专科 | Twin 确认后 on-demand 写入本地 corpus + 可 `retrieve_academic` |
| 租户 | 跨 `tenant_id` 检索拒绝 |
| 安全 | health 报 `bind_safe`；gitignore 覆盖 corpus/qdrant |
| Eval | `data/rag/eval-set.json` 回归命中率（可选 CI） |

测试：Vitest mock Qdrant/embedding；CI 不强制 live 外网拉取。

---

## 16. 实现批次（与产品 MVP 对齐）

| MVP | 目标 |
|-----|------|
| MVP-3 | 目录 + Qdrant 双 collection + Zod + health + 合规种子 + `retrieve_compliance` + Hybrid 学术检索 + `ingest_on_demand` + coverage |
| 后置 | 租户 SOP + eval + 安全硬化 |

总表：[`../1.product-definition.md`](../1.product-definition.md)。

---

## 17. 相关文档

- 功能规格（含 **Open questions 已决**）：[`rag-function-spec.md`](./rag-function-spec.md)  
- 用户故事：[`rag-stories.md`](./rag-stories.md)  
- Web 触发：[`../app/app-function-spec.md`](../app/app-function-spec.md) F-WEB-039  
- Agent 消费：[`../agent/agent-design.md`](../agent/agent-design.md) · function-spec `retrieve_*`  
- 安装：[`../4.install-dependencies.md`](../4.install-dependencies.md) §6  
- 研究底稿：`knowledge/rag-medical-knowledge-base/`（[ingest-feasibility-and-ops](../../knowledge/rag-medical-knowledge-base/ingest-feasibility-and-ops.md) · architecture · on-demand · content-acquisition）  
