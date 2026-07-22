# 技术方案：HCP × 文献 × 站点矩阵

> as_of：2026-07-17 · 设计入口 [`../../specs/mcp/mcp-design.md`](../../specs/mcp/mcp-design.md)  
> 准入：[`literature-sources.md`](./literature-sources.md)（无 ChiCTR）

## 矩阵

`hcp_id × (doi|pmid) × {openalex,orcid,pubmed,europe_pmc,crossref}` (+ CT.gov 旁证表)

## 两阶段

1. **AuthorIds**：OpenAlex / ORCID / PubMed → Gate（三选一非空）→ 用户确认同名  
2. **灌库**：OpenAlex works 为主 → DOI 对齐 PubMed、Europe PMC、Crossref；ORCID 有 works 则填；CT.gov 旁证  

## Fetch 要点

| 源 | 调用 |
|----|------|
| OpenAlex | `api.openalex.org/authors` · `/works?filter=author.id:` |
| ORCID | `pub.orcid.org/v3.0/{orcid}/works`（可空） |
| PubMed | E-utilities；`NCBI_API_KEY?` |
| Europe PMC | REST `DOI:` / `AUTHORID:` |
| Crossref | `api.crossref.org/works/{doi}` |
| CT.gov | `/api/v2/studies` |

## Postgres

`hcp_author_ids` · `works` · `hcp_work_hits` · 可选 `trial_hits`

## 验证

[`zhu-tongyu-matrix-probe.md`](./zhu-tongyu-matrix-probe.md)
