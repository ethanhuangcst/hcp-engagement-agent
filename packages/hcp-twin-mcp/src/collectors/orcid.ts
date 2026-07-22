import type { HttpClient } from "./http.js";

export async function fetchOrcidWorksCount(
  http: HttpClient,
  orcid: string,
): Promise<{ orcid: string; works_count: number; source_url: string }> {
  const id = orcid.replace(/^https?:\/\/orcid\.org\//, "").trim();
  const source_url = `https://orcid.org/${id}`;
  try {
    const data = await http.getJson<{
      "activities-summary"?: {
        works?: { group?: unknown[] };
      };
    }>(`https://pub.orcid.org/v3.0/${id}/activities`, {
      headers: { Accept: "application/json" },
    });
    const n = data["activities-summary"]?.works?.group?.length ?? 0;
    return { orcid: id, works_count: n, source_url };
  } catch {
    return { orcid: id, works_count: 0, source_url };
  }
}
