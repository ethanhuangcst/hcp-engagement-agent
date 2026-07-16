# medical-knowledge-base（RAG）功能规格

> as_of：2026-07-16 · 包名建议 `@hca/medical-kb`  
> 依据：[`1.product-definition.md`](../1.product-definition.md)、[`3.architecture.md`](../3.architecture.md) §5.3、[`4.install-dependencies.md`](../4.install-dependencies.md) §6、[`../agent/agent-function-spec.md`](../agent/agent-function-spec.md)、[`../app/app-function-spec.md`](../app/app-function-spec.md)、[`../../knowledge/rag-medical-knowledge-base/rag-architecture.md`](../../knowledge/rag-medical-knowledge-base/rag-architecture.md)、[`../../knowledge/rag-medical-knowledge-base/on-demand-ingest.md`](../../knowledge/rag-medical-knowledge-base/on-demand-ingest.md)、[`../../knowledge/rag-medical-knowledge-base/content-acquisition.md`](../../knowledge/rag-medical-knowledge-base/content-acquisition.md)、**rag-implementation**  
> 范围：`packages/medical-kb` — 双索引 RAG（ingest + Hybrid 检索 + citation）。**不是** Twin 采集、不是 Engagement 决策生成；供 Agent / BFF 调用。

## 0. 结论（先读）

| 原则 | 要求 |
|------|------|
| 双索引 | `academic_index` ‖ `compliance_index`；**禁止混库**；过滤/切块/失败策略分离 |
| 检索 | Dense（BGE-M3）+ Sparse（BM25）→ RRF（~0.7/0.3）→ rerank（bge-reranker-v2-m3）→ top-5 |
| 学术 ingest | Twin `specialty/themes` **按需**灌注；不做全科 / 全 PubMed 预灌 |
| 合规 ingest | P0 种子库（RDPAC 等）策展；客户 SOP 上传 + `tenant_id`；**不按病种自动爬** |
| Citation | 每条 chunk 含 source / version / as_of；Agent 生成须带 `academic_refs` + `compliance_refs` |
| **数据驻留与安全** | 知识主题/语料与向量**独立落在工程 `HCA_DATA_DIR` 下**；默认**不**用公有云向量 SaaS；Qdrant **不对公网暴露**；浏览器禁止直连 |
| 批次 | 功能与对外接口「实现批次」**默认 TBD** |

```text
Twin specialty/themes ──► ingest_on_demand ──► academic_index (本地 Qdrant)
合规种子 / 租户 SOP ──► seed / upload ─────► compliance_index (本地 Qdrant)
         ▲                         │
         │                         ▼
  data/rag/corpus/*     retrieve_academic ‖ retrieve_compliance
  （主题语料独立目录）              │
                                  ▼
                        hcp-engagement-agent（引用后生成）
                        仅经 BFF/内网，不经公网直连库
```

产品定义中的「全科医学知识库」在实现上修正为：**按专科按需 academic 索引**（见架构 ADR-06）。

---

## 0.1 知识库本地存放与数据安全（硬约束）

知识库按**主题独立目录**落在仓库数据根下，与代码包分离；运行时内容不进 Git、不默认上公网。

### 目录布局（工程内 · `HCA_DATA_DIR`，默认 `./data`）

```text
data/
├── rag/
│   ├── corpus/                      # 主题语料（源文件，独立存放）
│   │   ├── academic/                # 按 specialty 分子目录，如 kidney_transplant/
│   │   ├── compliance/              # 全局准则 PDF/文本（RDPAC 等）
│   │   └── tenants/{tenantId}/sop/  # 客户 SOP（敏感，强隔离）
│   ├── ingest-manifest.json         # 已灌文档清单、版本、as_of
│   └── eval-set.json                # 回归用例（可含脱敏样例）
└── qdrant/                          # Qdrant 本地持久化卷（向量 + payload）
```

| 资产 | 位置 | Git | 公网 |
|------|------|-----|------|
| 主题语料（PDF/文本） | `data/rag/corpus/**` | **忽略**（仅 `.gitkeep` 骨架可入库） | 不托管、不公开下载 |
| 向量索引 | `data/qdrant/` 或同机 Docker volume | **忽略** | Qdrant 端口**不**映射到 0.0.0.0 公网 |
| 研究型说明（非语料） | `knowledge/rag-medical-knowledge-base/*.md` | 可入库 | 无运行时密钥/客户 SOP |

### 网络安全

| 规则 | 要求 |
|------|------|
| Qdrant 监听 | 默认 `127.0.0.1:6333` 或 Docker **internal** 网络；生产禁止对公网 `0.0.0.0` 裸暴露 |
| 访问路径 | 仅 `medical-kb` → Qdrant；Agent/BFF → medical-kb；**浏览器永不直连** Qdrant/embedding |
| 默认禁止 | Pinecone / 托管向量 SaaS 作为默认后端（客户 VPC 自托管除外，须另开 ADR） |
| Embedding/Rerank | 优先进程内或内网推理服务；若用云 API，只传切块文本、不上传整库；Key 仅服务端 |
| 外向拉取 | ingest 可访问 PubMed 等**公开**源；写入仍落本地 corpus/Qdrant；失败不把语料缓存在第三方 |

### 访问与租户

| 规则 | 要求 |
|------|------|
| 租户 SOP | 物理路径 `corpus/tenants/{id}/` + payload `tenant_id`；检索强制过滤；禁止跨租户返回 |
| 鉴权 | 生产 BFF 鉴权后才调 medical-kb；本地开发可放宽但不得改默认绑定 |
| 日志 | 不打印完整 SOP/大段合规正文；脱敏 Key 与路径中的租户机密名 |
| 备份 | 备份 `data/rag` + `data/qdrant` 按客户数据分级；不进公开对象存储未加密桶 |

---

## 1. 哪些功能会调用到 medical-kb

| 调用方 | 场景 | medical-kb API |
|--------|------|----------------|
| Agent | `retrieve_academic` / `retrieve_compliance`（提案与 chat） | I-RAG-001 / I-RAG-002 |
| BFF | Twin 确认后按需 ingest（F-WEB-039） | I-RAG-003 |
| BFF | `/api/health` 含 Qdrant ping | I-RAG-004 |
| 运维/脚本 | 合规种子灌库、eval 回归 | I-RAG-005 / 内部 job |

不经 medical-kb：Twin CRUD、MCP 采集、纯 UI 展示已落盘 Insights。

---

## 实现批次说明

排期时再填入下表代号；当前表内一律 **TBD**。

| 批次 | 目标 | 验收重心 |
|------|------|----------|
| **R0** | 壳与本地安全底座 | 双 collection、**本地 corpus 目录**、Qdrant 非公网绑定、Zod、health、manifest |
| **R1** | 合规种子 + 检索 | 语料自 `data/rag/corpus/compliance` 灌入；可引用 |
| **R2** | Hybrid 学术检索 | BGE-M3 + BM25 + RRF + rerank；specialty 过滤 |
| **R3** | 按需 ingest | 写入本地 corpus + Qdrant；coverage；朱同玉/新专科 |
| **R4** | 租户 SOP + 硬化 | tenant 路径隔离、限流、eval、安全验收（无公网暴露） |
| **TBD** | 未排期（默认） | 已定义、顺序待定 |

---

## 功能列表

| 序号 | 功能编号 | 功能名称 | 功能简述 | 实现批次 |
|------|----------|----------|----------|----------|
| 1 | F-RAG-001 | medical-kb 包壳 | `@hca/medical-kb`；供 Agent/BFF 库调用；无 Playwright；不依赖 Next UI | TBD |
| 2 | F-RAG-002 | Qdrant 双 Collection（本地） | 创建/维护 `academic_index` 与 `compliance_index`；持久化在 `data/qdrant/`；可按 `v{major}` 命名 | TBD |
| 3 | F-RAG-002a | 主题语料独立目录 | 源文件落 `data/rag/corpus/{academic,compliance,tenants/**}`；与 `packages/*` 代码分离；按 specialty/主题分子目录 | TBD |
| 4 | F-RAG-002b | 禁止公网暴露向量库 | Qdrant 默认绑定回环或 Docker 内网；compose **不**发布 6333 到公网；启动校验拒绝不安全 `QDRANT_URL`（可选严格模式） | TBD |
| 5 | F-RAG-002c | 默认禁止托管向量 SaaS | 配置层默认仅 `qdrant-local`；改用公有云向量须 ADR + 显式 `VECTOR_BACKEND` | TBD |
| 6 | F-RAG-002d | 运行时数据不入库 | `data/rag/corpus/**`、`data/qdrant/**`、manifest 内容 gitignore；仅保留目录 `.gitkeep` | TBD |
| 7 | F-RAG-003 | 输入 Zod 校验 | `retrieve_*` / `ingest_*` 入参 Zod；结构化错误无堆栈 | TBD |
| 8 | F-RAG-004 | Embedding（BGE-M3） | 中英混合 dense；优先本地/内网；`EMBEDDING_MODEL` 路径或内网 URL | TBD |
| 9 | F-RAG-005 | Sparse / BM25 | 药名、MeSH、条款号等关键词路；与 dense 并行 | TBD |
| 10 | F-RAG-006 | Hybrid 融合 | RRF：dense ~0.7 + sparse ~0.3（可配）；召回池再 rerank | TBD |
| 11 | F-RAG-007 | Rerank | `bge-reranker-v2-m3`（或配置替代）；Top-N → top-5 | TBD |
| 12 | F-RAG-008 | 学术检索 | `retrieve_academic`：filter specialty / year / language；返回带 citation 的 chunks | TBD |
| 13 | F-RAG-009 | 合规检索 | `retrieve_compliance`：filter jurisdiction=CN、tenant_id；条款感知；供 Agent **强制**调用 | TBD |
| 14 | F-RAG-010 | Chunk 契约 / Citation | payload：`text, source, version, as_of, score` + 学术 `pmid/doi/authority` 或合规 `clause_id` | TBD |
| 15 | F-RAG-011 | 合规按条款切块 | 自本地 corpus 读入；按条款号切块；禁止整 PDF 糊成一块 | TBD |
| 16 | F-RAG-012 | 学术切块 | 摘要整段；全文按 section；指南按章节 + `authority`；切块结果入本地 Qdrant | TBD |
| 17 | F-RAG-013 | 合规种子灌库 | 从 `corpus/compliance` 灌 P0 准则；版本号 + effective_date；写 manifest | TBD |
| 18 | F-RAG-014 | 专科归一化 | 别名 → 受控 `specialty` / MeSH；禁止仅自由文本当 ingest query | TBD |
| 19 | F-RAG-015 | Coverage check | 按 specialty 判断 chunk/近窗文献是否充足 → ready \| sparse \| pending | TBD |
| 20 | F-RAG-016 | 按需学术 ingest | 拉取公开源后**先落** `corpus/academic/{specialty}/` 再 embed upsert；异步；不阻塞 Twin | TBD |
| 21 | F-RAG-017 | Ingest 状态回写 | `knowledge_status` / `knowledge_job_id` / `knowledge_updated_at` | TBD |
| 22 | F-RAG-018 | Ingest manifest | 更新 `data/rag/ingest-manifest.json`（doc_id、版本、as_of、specialty、本地 path） | TBD |
| 23 | F-RAG-019 | 异步任务队列 | 可选 BullMQ `rag-ingest`；同 specialty 去重/互斥 | TBD |
| 24 | F-RAG-020 | 获取限流与版权 | NCBI 配额、OA/摘要优先；闭源不存全文；第三方仅作拉取源不写回其侧永久库 | TBD |
| 25 | F-RAG-021 | 租户 SOP 入库 | 文件进 `corpus/tenants/{id}/sop/` + payload `tenant_id`；跨租户检索拒绝 | TBD |
| 26 | F-RAG-022 | Parent-Document（P2） | 小块召回、生成时可拉 parent 段落 | TBD |
| 27 | F-RAG-023 | 健康检查 | Qdrant 可达、双 collection、绑定地址安全摘要（是否 loopback/internal） | TBD |
| 28 | F-RAG-024 | 环境变量 | `QDRANT_URL`（默认 localhost）、`EMBEDDING_MODEL`、`RERANK_MODEL?`、`HCA_DATA_DIR`、`NCBI_API_KEY?`、`VECTOR_BACKEND=qdrant-local`、`QDRANT_ALLOW_NON_LOCAL?` | TBD |
| 29 | F-RAG-025 | Eval 回归 | `data/rag/eval-set.json`；不含真实客户 SOP 明文 | TBD |
| 30 | F-RAG-026 | 契约与安全测试 | Vitest：双索引不串库、tenant 隔离；断言默认 URL 非公网；gitignore 覆盖 corpus/qdrant | TBD |
| 31 | F-RAG-027 | 朱同玉/专科验收 | 本地库可命中；合规可引用；新专科 on-demand 写入本地目录 | TBD |

---

## 对外接口列表

Agent / BFF 经包 API 调用；浏览器**禁止**直连 Qdrant。

| 序号 | 接口编号 | 类型 | 接口名称 | 输入摘要 | 输出摘要 | 副作用 | 幂等 | 实现批次 |
|------|----------|------|----------|----------|----------|--------|------|----------|
| 1 | I-RAG-001 | API | `retrieve_academic` | `{ query, specialty?, themes?, year_from?, language?, top_k? }` | `{ chunks[] }`（含 citation 字段） | 无 | 是 | TBD |
| 2 | I-RAG-002 | API | `retrieve_compliance` | `{ query, jurisdiction?, tenant_id?, interaction_type?, top_k? }` | `{ chunks[] }`；可空（由 Agent gate 处理） | 无 | 是 | TBD |
| 3 | I-RAG-003 | API | `ingest_on_demand` | `{ specialty, themes?, hcpId?, force? }` | `{ jobId, knowledge_status }`（立即） | 异步写 Qdrant + manifest | 否（force 可重跑） | TBD |
| 4 | I-RAG-004 | API | `get_ingest_status` | `{ jobId }` 或 `{ specialty }` | `{ status, progress?, error? }` | 无 | 是 | TBD |
| 5 | I-RAG-005 | API | `seed_compliance` | `{ corpus_id?, paths? }` | `{ upserted, manifest_rev }` | 写 compliance_index + manifest | 是（同版本） | TBD |
| 6 | I-RAG-006 | API | `upsert_tenant_sop` | `{ tenant_id, docs[] }` | `{ upserted }` | 写 compliance + tenant 过滤字段 | 否 | TBD |
| 7 | I-RAG-007 | API | `health` | `{}` | `{ ok, qdrant, collections[], bind_safe?, embedding? }` | 无 | 是 | TBD |

### Chunk 出参形状（意向）

```text
RagChunk {
  id, text, score,
  source, source_url?, version, as_of,
  index: "academic" | "compliance",
  // academic
  doc_type?, specialty?, pmid?, doi?, authority?, language?, year?,
  // compliance
  clause_id?, jurisdiction?, tenant_id?, authority?
}
```

### 与 Agent / Web 映射

| medical-kb | 消费方 |
|------------|--------|
| `retrieve_academic` | Agent Tool `retrieve_academic`（I-AGT-007） |
| `retrieve_compliance` | Agent Tool `retrieve_compliance`（I-AGT-008）；提案路径强制 |
| `ingest_on_demand` | BFF F-WEB-039；Twin 确认后触发 |
| `health` | BFF `/api/health` |

### 错误契约（摘）

| code | 场景 | retryable |
|------|------|-----------|
| `VALIDATION_ERROR` | Zod 失败 | 否 |
| `QDRANT_UNAVAILABLE` | 向量库不可达 | 是 |
| `UNSAFE_QDRANT_BIND` | 公网可达或非允许的 `QDRANT_URL`（严格模式） | 否 |
| `CORPUS_PATH_INVALID` | 语料路径逃出 `HCA_DATA_DIR/rag/corpus` | 否 |
| `TENANT_ISOLATION_VIOLATION` | 请求租户与 chunk.tenant_id 不一致 | 否 |
| `EMBEDDING_UNAVAILABLE` | embedding 服务失败 | 是 |
| `SPECIALTY_UNRESOLVED` | 无法归一化专科 | 否 |
| `INGEST_IN_PROGRESS` | 同 specialty 已有 job | 是（稍后） |
| `INGEST_FAILED` | 拉取/灌库失败 | 视情况 |
| `COVERAGE_SPARSE` | 非错误：状态提示知识不足 | — |
| `RATE_LIMITED` | NCBI 等限速 | 是 |

### 调用顺序（给 BFF / Agent）

```text
P0 部署
  → 确认 data/rag/corpus + data/qdrant 目录存在且 gitignore
  → Qdrant 仅 localhost / internal
  → seed_compliance（读本地 corpus/compliance）
  → health（含 bind_safe）

Twin 确认（specialty/themes）
  → ingest_on_demand
       → 落盘 corpus/academic/{specialty}/ → embed → 本地 Qdrant
       → get_ingest_status 轮询（可选）

Agent proposeOptions / chat
  → retrieve_academic ‖ retrieve_compliance（仅内网）
       → chunks 作 tool_result（强制 citation）
```

---

## 依赖关系（简图）

```text
R0 本地 corpus 目录 + Qdrant 非公网 + Zod + health
  └─► R1 compliance 种子（本地）+ retrieve_compliance
        └─► R2 Hybrid academic retrieve
              └─► R3 ingest_on_demand（先落盘再索引）
                    └─► R4 tenant 路径隔离 + 安全/eval 硬化
```

检索管线（内部）：

```text
Query
  ├─ academic_index: filter → dense‖sparse → RRF → rerank → top-5
  └─ compliance_index: filter(CN, tenant) → clause-aware → rerank → top-5
```

---

## 非目标

- Twin / Playwright 采集（`hcp-twin-mcp`）
- Engagement Options 生成与 chat（`hcp-engagement-agent`）
- 浏览器直连 Qdrant 或暴露 embedding Key
- **默认**将语料/向量托管到公有云向量 SaaS，或把 Qdrant 端口映射到公网
- 把客户 SOP / 灌库语料提交进 Git 或公开文档站
- 一次性全科 / 全 PubMed 预灌
- 学术与合规混为单一索引
- 无授权批量爬取知网/万方
- Postgres / pgvector 作主向量库（本项目向量仅本地 Qdrant）

---

## Open questions

- [ ] Parent-Document 拉回是否进 P0（架构标 P2）
- [ ] 租户 SOP：仅 metadata 过滤 vs 物理分 collection（路径已按租户分目录）
- [ ] embedding/rerank：进程内模型 vs 内网推理服务（云 API 仅作例外）
- [ ] `knowledge_status` 写 Twin 旁路字段 vs 仅 manifest（需与数据字典对齐）
- [ ] 严格模式是否在开发环境默认关闭 `UNSAFE_QDRANT_BIND` 检查

---

## 相关文档

- 架构：[`3.architecture.md`](../3.architecture.md) §5.3、§8（数据驻留）
- 依赖：[`4.install-dependencies.md`](../4.install-dependencies.md) §0、§6、§7.5
- RAG 架构：[`../../knowledge/rag-medical-knowledge-base/rag-architecture.md`](../../knowledge/rag-medical-knowledge-base/rag-architecture.md)
- 按需灌注：[`../../knowledge/rag-medical-knowledge-base/on-demand-ingest.md`](../../knowledge/rag-medical-knowledge-base/on-demand-ingest.md)
- 内容获取：[`../../knowledge/rag-medical-knowledge-base/content-acquisition.md`](../../knowledge/rag-medical-knowledge-base/content-acquisition.md)
- Agent：[`../agent/agent-function-spec.md`](../agent/agent-function-spec.md)
- Web：[`../app/app-function-spec.md`](../app/app-function-spec.md)（F-WEB-039）
- Skill：rag-implementation
