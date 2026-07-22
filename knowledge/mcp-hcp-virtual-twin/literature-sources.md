# HCP 文献查询站点（按优先级）

> as_of：2026-07-17  
> **准入**：公开 HTTP API · 国内可访问 · 免登录 · 无爬虫  
> 同步：产品定义、mcp-function-spec §0.1、[`mcp-design.md`](../../specs/mcp/mcp-design.md)

| 优先级 | 站点 | 网址 | 用途 | 依赖 |
|--------|------|------|------|------|
| P0 | PubMed | https://pubmed.ncbi.nlm.nih.gov/ | PMID / 作者簇 | E-utilities；可选 `NCBI_API_KEY` |
| P0 | ORCID | https://orcid.org/ | 作者号；作品（有则拉） | 公开 REST |
| P0 | OpenAlex | https://openalex.org/ | 作者 / 作品主灌库 | `api.openalex.org`；建议 `mailto` |
| P1 | Europe PMC | https://europepmc.org/ | PMID 互补 | 公开 REST |
| P1 | Crossref | https://www.crossref.org/ | DOI 题录归并 | 公开 REST |
| P2 | ClinicalTrials.gov | https://clinicaltrials.gov/ | 试验旁证 / 消歧 | 公开 API v2 |

**剔除**：Google Scholar、Semantic Scholar、Scopus/WoS、CNKI/万方/SinoMed、**ChiCTR**（无稳定免登录 API）。

**消歧顺序**：orcid → pubmed_author → openalex → Europe PMC / Crossref → CT.gov 旁证。  
`resolved`：orcid / pubmed_author / openalex ≥1 非空。

实现：[`mcp-design.md`](../../specs/mcp/mcp-design.md) · [`hcp-literature-matrix-tech.md`](./hcp-literature-matrix-tech.md) · 验证 [`zhu-tongyu-matrix-probe.md`](./zhu-tongyu-matrix-probe.md)
