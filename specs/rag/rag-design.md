# medical-kb 设计：双索引 RAG 与灌注

> as_of：2026-10-21（新增 §18：受控学科目录扩充与学术索引批量种子，feature-09 / MKB2-02；新增 §19：合规覆盖信号与条款版本治理，MKB2-03；新增 §20：学术索引写入与恢复健壮性，DEF-003 / DEF-004 修复，US-RAG-009 / F-RAG-033–034）  
> 规格：[`rag-function-spec.md`](./rag-function-spec.md) · 架构 §5.3 · 安装 §6  
> 包：`@hca/medical-kb` · 向量：Qdrant · 元数据：MySQL 主库（ADR-005）  
> 原则：**rag-implementation**（Hybrid + citation；不做持续全科预灌、禁止混库；一次性冷启动批量种子见 §18）

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
| corpus 落盘 + Qdrant upsert + MySQL manifest | 浏览器直连、公有云向量 SaaS（默认） |
| specialty 归一化、coverage、异步 job | 知网/万方无授权爬取 |

```text
BFF / Agent ──► medical-kb API ──► Qdrant（向量）
                      │
                      ├─► MySQL（ingest_manifest / job）
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
  → BFF 写 Twin（MySQL）
  → BFF F-WEB-039：POST /api/rag/ingest 或内联调用
       body: { specialty, themes?, hcpId, force? }
  → medical-kb.ingest_on_demand  → 立即返回 { jobId, knowledge_status }
  → 异步 job：
       归一化 specialty
       → coverage check
       → 拉公开源（PubMed / OpenAlex / 指南摘要；OA 优先）
       → 写入 data/rag/corpus/academic/{specialty}/
       → 切块 → embed → upsert academic_index
       → 更新 MySQL ingest_manifest + rag_ingest_jobs（knowledge_status）
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
| 7 | 记录 manifest：`doc_id / version / as_of / path` | MySQL |

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

受控目录于 feature-09（MKB2-02）扩充到临床一级学科全集；清单与批量种子设计见 [§18](#18-受控学科目录扩充与学术索引批量种子feature-09--mkb2-02)。

---

## 10. 对外 API（设计契约）

| API | 调用方 | 要点 |
|-----|--------|------|
| `retrieve_academic` | Agent | filter + Hybrid；无写副作用；返回体附 `coverage`（ADR-014，feature-07 批次） |
| `retrieve_compliance` | Agent（提案**强制**） | 可空结果 → Agent gate；租户隔离 |
| `ingest_on_demand` | BFF F-WEB-039 · 对外 MCP `add_hcp` 预灌（ADR-014） | 立即返回 `jobId`；异步写 |
| `resolveSpecialtiesForIngest` / `triggerKnowledgeIngest` | BFF · 对外 MCP `add_hcp`（ADR-014，feature-07 批次从 webapp lib 提取入包） | twin 专科/主题/科室 → 受控键集合；fire-and-forget 灌注，失败不阻塞调用方 |
| `get_ingest_status` | BFF / UI · 对外 MCP（ADR-014） | 按 jobId 或 specialty |
| `seed_compliance` | 运维 | 同版本幂等 |
| `upsert_tenant_sop` | 运维 / BFF | 路径 + payload `tenant_id` |
| `health` | BFF `/api/health` | qdrant + collections + `bind_safe` |

入参 Zod；错误码见功能规格（`QDRANT_UNAVAILABLE`、`TENANT_ISOLATION_VIOLATION`、`INGEST_IN_PROGRESS` 等）。

异步：同 specialty 互斥（进程内 + DB 状态）；BullMQ 属后置（多实例时），见 [`../ToDo.md`](../ToDo.md)。

---

## 11. MySQL 元数据（ADR-005；DEF-002 修复口径）

| 表 / 实体 | 用途 |
|-----------|------|
| `ingest_manifest` | doc_id、index、specialty?、version、as_of、corpus_path、chunk_count |
| `rag_ingest_jobs` | jobId、specialty、status（= knowledge_status）、progress、error、hcpId?；**权威状态源** |
| Twin | **不**在 Twin JSON / 数据字典写入 knowledge_*；列表展示由 BFF 联表 jobs；可选 `hcp_twins` 表级旁路列镜像（非 JSONB 文档字段） |

方言与往返规则（DEF-002 / US-RAG-006）：

- 占位符一律 `?`；进行中过滤用 `status IN (?, ?)`，不用 `ANY($n::text[])`。
- MySQL 无 `RETURNING`：`INSERT` / `UPDATE` 后按主键回读 `SELECT`。
- manifest upsert 用 `INSERT ... AS new ON DUPLICATE KEY UPDATE`（行别名形式，MySQL 8.0.19+），不用 `ON CONFLICT ... EXCLUDED`。
- `error` 为 MySQL JSON 列：写入传 JSON 字符串；mysql2 读出为字符串，读侧解析还原对象。
- 与 Twin 共用 `DATABASE_URL`。向量**不**进 MySQL。

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
| MVP-3 扩充（feature-09 / MKB2-02） | 受控目录扩到临床一级学科全集 + 学术索引一次性批量种子（[§18](#18-受控学科目录扩充与学术索引批量种子feature-09--mkb2-02)） |
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

---

## 18. 受控学科目录扩充与学术索引批量种子（feature-09 / MKB2-02）

> 依据：[MKB2-02](../product-backlog.md#pb-12) · [ADR-014](../../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md) · US-RAG-007。动因：王拥军（神经内科）入库后预灌因学科非受控静默跳过，检索无真实证据。

### 18.1 受控目录扩充

| 项 | 设计 |
| --- | --- |
| 位置 | `packages/medical-kb/src/specialty.ts` `ALIAS_MAP`（既有机制不变，仅扩数据） |
| 清单 | 临床一级学科全集，约 20-30 键（neurology 为首个案例；内、外、妇、儿等按 `specialty_key` 命名，同现有 snake_case 风格） |
| 别名 | 每键中英文别名（如 neurology：神经内科、神经病学、neurology） |
| 科室正则 | `ingest-trigger.ts` `resolveSpecialtiesForIngest` 的 department 启发式补神经科等模式（既有肾移植 / 噬菌体 / 遗传唐氏不回归） |
| 行为不变项 | 未收录别名仍 `SPECIALTY_UNRESOLVED`；`tryNormalizeSpecialty` 仍返回 null 静默跳过；`CONTROLLED_KEYS` 由 `ALIAS_MAP` 派生 |

### 18.2 批量种子脚本

| 项 | 设计 |
| --- | --- |
| 位置 | `packages/medical-kb` 包内脚本（CLI 入口），复用 `ingestOnDemand` 既有管线（job、manifest、Qdrant、fixture 兜底全部既有） |
| 流程 | 逐受控学科串行：先 `coverageCheck`，ready 幂等跳过；否则 `ingestOnDemand`（PubMed / OpenAlex 拉取为主，源不可用走 fixture 路径） |
| 失败隔离 | 单学科失败降级 fixture 并继续；全部源不可用记结构化日志（JSON event）跳过；脚本可重跑，重跑仅补未 ready 学科 |
| 限流 | 沿用 F-RAG-020 底线：公开源限流、摘要 / OA 优先、闭源不存全文 |
| 产出 | 每学科 `coverageCheck` 为 ready（chunk ≥ 3）；`rag_ingest_jobs` / manifest 为权威记录 |

### 18.3 验收锚点

- 王拥军（`hcp_a5057449191`，神经内科）经 `retrieve_academic` 返回真实神经内科证据且 `coverage: ready`。
- 批量脚本跑完逐学科 `coverageCheck` 全 ready；重跑幂等。
- 批量验收以 §20.1 修复后口径为准（28 学科盘-vs-库逐条相等，非仅 ≥3 阈值）。

### 18.4 与既有故事分界

- 不改 MCP 工具面（feature-07/08 已交付或另批）；不改 Web；`ingest_on_demand` 接口签名不变。
- 一次性冷启动；后续新学科走既有链路（add_hcp 预灌或 MCP2-08 `ingest_academic`）。

---

## 19. 合规知识覆盖信号与条款版本治理（MKB2-03）

> 依据：[MKB2-03](../product-backlog.md#pb-13) · US-RAG-008 · F-RAG-030–032。动因：合规种子仅 10 条两个来源，稀疏不可见；同 `clause_id` 多版本并存，无下线机制。

### 19.1 覆盖信号

| 项 | 设计 |
| --- | --- |
| 权威源 | `ingest_manifest`（`index_name = compliance_index`），不扫 Qdrant、不写 Twin |
| 聚合 | 新增 `complianceCoverage()`：按 `authority` 取最新版本行，返回 `{ authorities: [{ authority, version, chunk_count, as_of }], status }` |
| 状态口径 | `ready`：至少一个 authority 行 `chunk_count > 0`；`sparse`：manifest 无任何 authority 行（冷启动未灌种）；跳过无阈值，全量来自 manifest | 
| 地域维度 | manifest 无 jurisdiction 列，现行种子全部为 CN；本节 coverage 不做 jurisdiction 切分，后置另开条目 |
| 挂载点 | `retrieveCompliance` 返回体附 `coverage`；sparse 附 `repair_hint` 建议运维 `seed_compliance` 后重试；同 ADR-014：只读旁路、不内联补种 |
| 降级 | manifest 读取失败时省略 `coverage` 字段，检索照常，不报错 |
| Agent 消费 | `retrieveComplianceForAgent` 透传；`proposeOptions` / gate 不因 coverage 缺失败或改变既有软失败语义 |

### 19.2 条款版本治理

| 项 | 设计 |
| --- | --- |
| 点 ID | 沿用 `hash(clause_id + version)`，天然携带版本 |
| 下线策略 | `seedCompliance` 灌入 (authority, 新 version) 成功后，对该 authority 在 manifest 中登记的旧 version 按 Qdrant filter `{ authority, version = 旧 }` 执行 `delete`（`wait: true`），再写新 manifest 行 |
| 幂等 | 重跑同版本：删除集合为空，行为等价 no-op；manifest 仍是 (authority:version) 主键 |
| 失败语义 | 删除失败记结构化日志（`{ code, authority, version, message }`）并抛 `INGEST_FAILED`，可重跑；不允许半状态（已删未记、已记未删只允许日志可查） |
| 检索侧 | 不加版本过滤兜底：下线以删除为主，检索逻辑保持不变 |

### 19.3 种子扩充与目录口径

| 项 | 设计 |
| --- | --- |
| 扩充量 | `rdpac` 2024-01 ≥15 条；`cn_med_rep_measures` 2026-08 ≥8 条；仍手动策展，不自动爬 |
| authority 键 | `authority` 字段为灌库口径（如 `cn_med_rep_measures`），corpus 目录名不参与过滤；新 authority 仅受 Zod schema 约束，无受控词表 |
| 数据卫生 | 灌库前逐行 Zod；行缺 `clause_id` / `version` 时按行号报 `VALIDATION_ERROR`，整批不灌，防半状态 |
| 既有 tenant 数据 | 本地库存在历史 `tenant-demo` 测试点不属于全局种子；验收断言仅以 `tenant_id IS NULL` 全局行计 |

### 19.4 与既有故事分界

- 租户 SOP（F-RAG-021 / I-RAG-006）仍后置，本节不设计租户写入通路。
- 不新增对外 MCP 工具；`retrieve_compliance`（MCP2-05）按既有 PBI 契约透传 `coverage`，须与本节同批验收。
- 学术侧的 coverage 与本节互不复用（口径不同：受控专科 vs authority 清单），不抽公共层。

---

## 20. 学术索引写入与恢复健壮性（DEF-003 / DEF-004 修复）

> 依据：[issues-log DEF-003 / DEF-004](../issues-log.md) · US-RAG-009 · F-RAG-023 / 029 / 033 / 034。动因：批量种子实测 13/28 学科丢点（point ID 冲突）；写入窗口进程被强杀导致 Qdrant WAL 损坏、读路径 panic 不可恢复。仿 §11（DEF-002 修复口径）先例，本节记录缺陷修复后的设计口径。

### 20.1 学术 point ID 唯一性（DEF-003）

| 项 | 设计 |
| --- | --- |
| 键结构 | `academicPointId` 键改为 `${specialty}:pmid:${pmid}` / `${specialty}:doi:${doi}`；fixture fallback（`${specialty}:${index}:${version}`）不变 |
| 跨学科重叠 | 同 PMID 跨学科各自成点：语料重叠是 PubMed 按专科查询的常态，不是错误；两个专科的 chunk payload 不同（specialty 字段不同），必须并存 |
| 迁移 | 新旧 ID 不同，原地重跑会留下旧 ID 孤儿点，污染 BM25 词频与 dense 检索。迁移必须**清 `academic_index` 全量重灌**（`seed:academic-batch --force --no-fetch` + `seed:compliance`），不允许增量补种 |

### 20.2 读路径健康探测与损坏恢复（DEF-004）

| 项 | 设计 |
| --- | --- |
| 根因 | 写入窗口进程被环境强杀（exit 137/143）→ Qdrant 磁盘 WAL/shard 损坏 → 读路径 panic（`OffsetOutOfBounds` → HTTP 500，复现在无 offset 的带 filter `points/search` 上）→ 重启不可恢复，唯清库重灌可行 |
| 健康探测 | `health()` 在 ping + listCollections 基础上，对双 collection（`academic_index` / `compliance_index`）各执行一次带 filter 的 1 点探测读；坏 shard 在 listCollections 不可见，只有探测读会触发 panic；探测失败时 `ok: false` 并附错误细节 |
| 信号陷阱 | seed CLI 捕获 SIGTERM / SIGINT：等待当前学科 job 到终态再退出，不产生半状态写入窗口 |
| scroll 翻页 | `countQdrantSpecialtyChunks`、`loadAcademicPayloadsForBm25`、`loadCompliancePayloadsForBm25` 三处改 point-ID 游标（以上一页最后 point id 作游标），消除对 Qdrant 内部 sequential offset 的依赖；本项为稳健化，不是 DEF-004 根因修复 |
| 恢复 runbook | 停 Qdrant → 删 `academic_index` 数据目录 → 重启 → `seed:academic-batch --force --no-fetch` + `seed:compliance`；语料全在盘上（`data/rag/corpus/`），实测约 3 分钟 |

### 20.3 验收锚点

- 28/28 学科盘-vs-库逐条相等（读 `data/rag/corpus/academic/{s}/chunks.jsonl` 对比 Qdrant scroll，非仅 `coverageCheck` ≥3 阈值）。
- 重跑幂等：全量重灌后重跑，全部 `skipped_ready`。
- 王拥军（`hcp_a5057449191`）经 `:3300 tools/call retrieve_academic` 返回 neurology 5 条真实证据。
- health 探测用例：mock 探测读 panic / 500 时 `ok: false`。
- 恢复演练计时 ≤5 分钟恢复 28/28 ready。

## 21. seed CLI 启动序统一（DEF-007 修复）

> 依据：[issues-log DEF-007](../issues-log.md) · [US-RAG-010](rag-stories.md) · F-RAG-002 / F-RAG-023 · [MKB2-05](../product-backlog.md#pb-17)。动因：OGT-5 生产回灌实发——`seed-compliance.ts` 先跑 `health()` 预检（探测读要求集合已存在）后跑 `ensureDualCollectionsWithProbe()` 建集合，空库上鸡生蛋、永远 404 中止；同包 `seed-academic-batch.ts` 与 `ingest-academic.ts` 顺序正确。仿 §20 先例记录修复后的设计口径。

### 21.1 启动序契约

| 项 | 设计 |
| --- | --- |
| 顺序 | 所有 seed / ingest CLI 统一启动序：`ensureDualCollectionsWithProbe()` → `health()` → 业务 seed。预检只探测「已确保存在」的对象，不在建集合前探测 |
| 修复范围 | `seed-compliance.ts` main 改 ensure 先行（其余两个 CLI 已正确）；`health()` 与 `ensureDualCollectionsWithProbe()` 本身不改，DEF-004 探测口径不变 |
| 测试锚 | 单元：mock `../api.js` 断言三步调用顺序；health 不 ok 时 exit 非零且不 seed。集成（opt-in）：删双 collection 的本地 Qdrant 上直接 `seed:compliance` 自举通过；重跑幂等 |
| 绕法退役 | 手动预建空集合绕法（data-backfill-design 执行记录）随修复退役，只保留历史记录 |

### 21.2 验收锚点

- 空库（无任何 collection 的 Qdrant）直接 `npm run seed:compliance` 全流程通过，无人工预建。
- 已灌环境重跑幂等：compliance 向量数与 manifest 不变。
- 单元回归锁定三个 CLI 的 ensure → health → seed 顺序。
