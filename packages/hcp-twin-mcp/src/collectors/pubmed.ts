import type { HttpClient } from "./http.js";

/**
 * PubMed E-utilities：按作者姓名粗搜（需已有消歧上下文；禁止仅中文灌库由 gate 保证）。
 */
export async function searchPubmedAuthorCluster(
  http: HttpClient,
  nameEn: string,
): Promise<{ pubmed_author: string | null; sample_pmids: string[] }> {
  const term = encodeURIComponent(`${nameEn}[Author]`);
  const key = process.env.NCBI_API_KEY
    ? `&api_key=${encodeURIComponent(process.env.NCBI_API_KEY)}`
    : "";
  const esearch = await http.getJson<{
    esearchresult?: { idlist?: string[]; count?: string };
  }>(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${term}${key}`,
  );
  const ids = esearch.esearchresult?.idlist ?? [];
  return {
    pubmed_author: ids.length > 0 ? nameEn : null,
    sample_pmids: ids,
  };
}

export async function enrichPmidByDoi(
  http: HttpClient,
  doi: string,
): Promise<string | null> {
  const key = process.env.NCBI_API_KEY
    ? `&api_key=${encodeURIComponent(process.env.NCBI_API_KEY)}`
    : "";
  const term = encodeURIComponent(`${doi}[DOI]`);
  const esearch = await http.getJson<{
    esearchresult?: { idlist?: string[] };
  }>(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=1&term=${term}${key}`,
  );
  return esearch.esearchresult?.idlist?.[0] ?? null;
}
