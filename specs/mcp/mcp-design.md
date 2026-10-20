# hcp-twin-mcp 设计：文献矩阵

> as_of：2026-07-17  
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
