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
