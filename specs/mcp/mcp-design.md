# hcp-twin-mcp 设计：文献矩阵

> as_of：2026-10-21（2026-07-17 首版；2026-10-21 新增 MCP2-09 科室来源标注与数据源对照节，DEF-005；同日 MCP2-09 范围外补记：入库科室规则见 MCP2-10 / mcp2-design §13.6，DEF-006，D2，本节 resolve 契约不变；同日 MCP2-09 归一化与判定增补：论文级概念懒加载补信号与 OpenAlex 概念映射表、输入侧口语缩写归一化，B+ 设计）  
> 准入源见 [`literature-sources.md`](../../knowledge/mcp-hcp-virtual-twin/literature-sources.md)（6 站；已删 ChiCTR）  
> 详版 / 验证：knowledge `hcp-literature-matrix-tech.md`、`zhu-tongyu-matrix-probe.md`

## 目标

```text
hcp_id × work(doi|pmid) × source_site → hit_status
```

投影到 Twin：`author_ids`、`recent_pubs`、`themes`。存香港 Postgres。

## 流水线

```text
Phase A  姓名+医院+科室 → **人候选** `candidates[]`（姓名/机构为主；网页与库名进 evidence）
         + AuthorIds 草稿（OpenAlex/ORCID/PubMed）
         多候选 → needs_review；用户确认后 resolved
         Gate：orcid|pubmed_author|openalex ≥1
Phase B  OpenAlex works → DOI 归并
         PubMed / Europe PMC / Crossref 按 DOI 填矩阵列
         ORCID works（有则填；可空）
         CT.gov → 旁证（非论文主矩阵）
```

禁止：仅中文姓名灌库；文献通道 Playwright；ChiCTR。

## 适配器

| 站 | Resolver | Fetcher |
|----|----------|---------|
| OpenAlex | `/authors?search=` + 机构 | `/works?filter=author.id:` |
| ORCID | 回填 / 公开 person | `/v3.0/{orcid}/works`（可空） |
| PubMed | `orcid[auid]` / Computed Authors | esearch→efetch / DOI |
| Europe PMC | ORCID/作者 | REST by DOI/ORCID |
| Crossref | — | `/works/{doi}` |
| CT.gov | 姓名+机构 | API v2 studies |

## 库表（示意）

- `hcp_author_ids`：orcid, pubmed_author, openalex, status  
- `works`：doi, pmid, title, year…  
- `hcp_work_hits`：(hcp_id, work_id, source_site) → status, native_id, url  
- `trial_hits`（可选）：nct_id, hcp_id, role  

## 包结构

```text
packages/hcp-twin-mcp/src/collectors/research/
  resolvers/  openalex.ts orcid.ts pubmed.ts
  fetchers/   同上 + europepmc.ts crossref.ts ctgov.ts
  merge.ts    DOI 归并
  gate.ts     AuthorIds 门禁
```

Tools：`resolve_hcp_identity` → `build_twin` Stage C（F-MCP-012–014、021）。

## 环境

`DATABASE_URL` · `NCBI_API_KEY?` · `OPENALEX_MAILTO?`

## 朱同玉验证摘要

锚点：OpenAlex `A5101900733` · ORCID `0000-0002-6197-0698` · NCT01794871（中山 / tyzhu@fudan.edu.cn）。  
论文矩阵：OpenAlex→DOI→PubMed/EuropePMC/Crossref 可对齐；ORCID works 空；CT.gov 旁证可用。

---

## TWIN2-01 定时刷新与洞察回填（2.0 技术设计）

Stories：[mcp-stories.md](./mcp-stories.md) US-MCP-007 · Tests：[mcp-tests.md](./mcp-tests.md) · 决策：[ADR-013](../../docs/adr/ADR-013-insight-synthesis-triggers.md)

### Stack

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 调度 | node-cron（进程内） | ADR-2.0-4：无新进程、无 Redis 依赖 |
| 构建 | 既有 `src/build/queue.ts` Stage A–E 管线 | 复用 `enqueue(hcpId, mode)` 的同 hcpId 单 active run 去重（F-MCP-018） |
| 洞察回填 | `ensureDoingNow(hcpId)` 幂等入口 | 三触发源收敛（ADR-013）；复用 `synthesizeDoingNow` 的 reused 语义 |

### Runtime

- 位置：`packages/hcp-twin-mcp/src/scheduler/`，随 MCP 进程启动，不新增服务。
- 开关：`TWIN_REFRESH_CRON` 未设为关闭，进程行为与 1.0 完全一致。
- 刷新范围：`listTwins()` 全部已保存医生，排除 `_agent_general`，逐个顺序执行，避免打满外网配额。
- 跳过：距上次成功刷新不足 `TWIN_REFRESH_TTL_HOURS`（默认 24）的 HCP 跳过。
- 失败：单个 HCP 失败不阻断本轮；stderr 结构化日志；Twin 正文保留上次成功版本。

### Data

- 无新表、无迁移；复用 `hcp_twins` / `hcp_insights`（ADR-005）。
- 洞察回填写 `hcp_insights.doing_now`，幂等；进行中合成 run 复用，不重复起任务。

### Integrations

- 构建完成钩子：`BuildQueue.run` 成功分支调用注入的 `onBuildComplete(hcpId)`，由启动装配接到 `ensureDoingNow`；钩子失败不改变 build 状态、不阻断队列。
- `ensureDoingNow` 落 `packages/hcp-engagement-agent`（`synthesizeDoingNow` 同层收敛导出，ADR-013）；`hcp-twin-mcp` 以 workspace 依赖直调，测试注入假钩子。
- `add_hcp` 异步触发：对外 MCP handler 写库成功后 fire-and-forget 调对内 `build_twin`（HTTP，`MCP_URL` 含 `/mcp`），返回 `refresh: { run_id }`；入队失败（含 activeRun 冲突）不影响成功返回，只记日志。

### Security

- 密钥只经环境变量（`DATABASE_URL`、LLM Key）；stderr 日志无堆栈、无连接串、无 Key。
- 对外不暴露手动刷新入口；洞察回填属数据面幂等写（ADR-013）。

### Tests

见 [mcp-tests.md](./mcp-tests.md)；基线 **common-test-strategy** 与 [spec1.0/7.test-strategy.md](../spec1.0/7.test-strategy.md)（更严者胜）。

## MCP2-09 科室来源标注与数据源对照（DEF-005）

> 故事：[US-MCP-002 后三场景](./mcp-stories.md) · 功能：[F-MCP-012 增补](./mcp-function-spec.md) · 测试：[mcp-tests §5](./mcp-tests.md) · 动因：[DEF-005](../issues-log.md)

### 字段

- `ResolveCandidate` 新增 `department_provenance: { origin: "caller_input" | "fixture", verified: false }`；`department` 继续回显调用方输入，不当作已核实身份。live 与 mock 回显路径 `origin` 为 `caller_input`；朱同玉 fixture 路径 `origin` 为 `fixture`（诚实标注样例数据，CI 可断言）。
- OpenAlex 作者的医学主题词与机构元数据可用时，新增 `department_signal`：主题词原文与归一化后的受控专科键。
- 两侧专科键不一致时新增 `department_mismatch`：附两侧键值，供确认者对照；不自动改写 `department`。

### 归一化与判定

- 归一化主权在 medical-kb（28 受控专科键）：输入科室走既有 department 正则（2026-10-21 补口语缩写：`神内` → neurology、`肾内` → nephrology，mismatch 机制对口语输入端到端可用）；OpenAlex 主题词先走受控别名表，再走 OpenAlex 概念映射表（`openAlexConceptSpecialty`：Hemodialysis / Dialysis / Kidney disease / Nephropathy / Chronic renal failure 等领域概念 → nephrology；泛化词 Medicine / Internal medicine / Computer science 不入表）。`hcp-twin-mcp` 以 workspace 依赖导入，不复制映射表（`triggerKnowledgeIngest` 入包同款先例，ADR-014）。
- **论文级懒加载补信号（2026-10-21，B+ 设计）**：作者级主题词（search 端点 top-5 x_concepts）推不出受控专科键的候选，resolve 懒拉其论文级概念（works 端点 `select=concepts`，level≥1 专科概念优先、按出现次数降序、取前 8），合并进主题词再推一次；`department_signal.topics` 反映合并后的实际依据。论文源失败降级为仅作者级信号，不阻塞整次 resolve；两级都推不出受控科室时不编造信号，保存仍被 MCP2-10 无信号阻断拦截。
- mismatch 判定：输入侧与信号侧均归一出非空专科键且两键不同才提示；任一侧不可归一化则降级为仅来源标注，不报错、不阻塞。
- 数据源信号缺失（作者级与论文级均无可用信号）同降级口径。

### 范围外

- 不自动纠正科室（OpenAlex 无可靠中文科室字段）；不新增对外工具。确认返回的映射预览归对外 MCP：[mcp2-design §13](../mcp2.0/mcp2-design.md)；Web 展示归 [app-stories US-WEB-004](../app/app-stories.md)。
- 本节 resolve 契约不变（`department` 原样回显输入、`origin: caller_input`）；入库科室规则、mismatch 强闸门与无信号阻断见 [MCP2-10 / mcp2-design §13.6](../mcp2.0/mcp2-design.md)（DEF-006，D2）：改写只发生在 `add_hcp` 入库一步，不回改本节字段。

### Tests

见 [mcp-tests.md §5](./mcp-tests.md)。
