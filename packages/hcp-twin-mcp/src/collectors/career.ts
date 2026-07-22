import type { HttpClient } from "./http.js";
import {
  careerFromOpenAlex,
  fetchOpenAlexAuthor,
} from "./openalex.js";

/** 医院专家页：公开 HTML 轻量抽取（非 CRM）；失败不阻断. */
export async function fetchHospitalPageSignals(
  http: HttpClient,
  url: string,
): Promise<{
  source_url: string;
  title_guess: string | null;
  snippets: string[];
}> {
  try {
    const html = await http.getText(url);
    const title =
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim().replace(/\s+/g, " ") ??
      null;
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 4000);
    const keywords = ["主任医师", "教授", "科主任", "院长", "院士", "教授"];
    const snippets = keywords
      .filter((k) => text.includes(k))
      .map((k) => {
        const i = text.indexOf(k);
        return text.slice(Math.max(0, i - 20), i + 40).trim();
      })
      .slice(0, 5);
    return { source_url: url, title_guess: title, snippets };
  } catch {
    return { source_url: url, title_guess: null, snippets: [] };
  }
}

export async function collectCareerLive(
  http: HttpClient,
  input: {
    openalexId?: string | null;
    hospitalUrl?: string | null;
    asOf: string;
  },
) {
  let fromAlex = {
    positions_current: [] as Array<Record<string, unknown>>,
    positions_past: [] as Array<Record<string, unknown>>,
  };
  if (input.openalexId) {
    const author = await fetchOpenAlexAuthor(http, input.openalexId);
    if (author) fromAlex = careerFromOpenAlex(author, input.asOf);
  }

  let hospital_page: Awaited<ReturnType<typeof fetchHospitalPageSignals>> | null =
    null;
  if (input.hospitalUrl) {
    hospital_page = await fetchHospitalPageSignals(http, input.hospitalUrl);
    if (hospital_page.title_guess && fromAlex.positions_current.length === 0) {
      fromAlex.positions_current.push({
        title: hospital_page.snippets[0] ?? "Hospital page",
        org: hospital_page.title_guess,
        as_of: input.asOf,
        confidence: "low",
        source_url: hospital_page.source_url,
        source_type: "hospital_page",
      });
    }
  }

  return {
    ...fromAlex,
    hospital_page,
    collected_at: input.asOf,
  };
}
