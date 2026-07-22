import type { AuthorIds } from "@hca/domain";
import type { HttpClient } from "./http.js";

type OpenAlexConcept = {
  display_name?: string;
  score?: number;
  /** OpenAlex 层级：0=宽泛学科，1+=专科/主题；中文医学文常见误标 level-0 */
  level?: number;
};

type OpenAlexAuthor = {
  id?: string;
  display_name?: string;
  orcid?: string | null;
  last_known_institutions?: Array<{ display_name?: string; country_code?: string }>;
  affiliations?: Array<{
    institution?: { display_name?: string };
    years?: number[];
  }>;
  x_concepts?: OpenAlexConcept[];
  counts_by_year?: Array<{ year: number; works_count: number }>;
};

export type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  primary_location?: { source?: { display_name?: string | null } | null } | null;
  authorships?: Array<{ author?: { id?: string; display_name?: string } }>;
  concepts?: OpenAlexConcept[];
  type?: string | null;
};

function normalizeWorkTitle(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

/** Dedup works across multiple OpenAlex author clusters (DOI first, else title). */
export function dedupeOpenAlexWorks(works: OpenAlexWork[]): OpenAlexWork[] {
  const out: OpenAlexWork[] = [];
  const seenDoi = new Set<string>();
  const seenTitle = new Set<string>();
  for (const w of works) {
    const doi = w.doi?.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase().trim();
    if (doi) {
      if (seenDoi.has(doi)) continue;
      seenDoi.add(doi);
      out.push(w);
      const t = normalizeWorkTitle(w.title ?? w.display_name);
      if (t) seenTitle.add(t);
      continue;
    }
    const t = normalizeWorkTitle(w.title ?? w.display_name);
    if (t) {
      if (seenTitle.has(t)) continue;
      seenTitle.add(t);
    }
    out.push(w);
  }
  return out;
}

/**
 * 中文医学文献上 OpenAlex 常把无关 level-0 学科标成首概念。
 * 当作者画像已偏医学时，禁止这些噪声抬升为 themes[0]。
 */
const NOISE_L0_WHEN_MEDICAL = new Set(
  [
    "Computer science",
    "Geology",
    "Business",
    "Economics",
    "Political science",
    "Philosophy",
    "Art",
    "History",
    "Geography",
    "Sociology",
    "Psychology",
    "Mathematics",
    "Physics",
    "Nuclear physics",
    "Chemistry",
    "Materials science",
    "Engineering",
    "Environmental science",
  ].map((s) => s.toLowerCase()),
);

const MEDICAL_ANCHOR = new Set(
  [
    "Medicine",
    "Biology",
    "Cardiology",
    "Internal medicine",
    "Surgery",
    "Oncology",
    "Nephrology",
    "Pathology",
    "Pharmacology",
    "Immunology",
    "Genetics",
    "Nursing",
    "Psychiatry",
    "Radiology",
    "Pediatrics",
  ].map((s) => s.toLowerCase()),
);

function isMedicalAnchor(name: string): boolean {
  return MEDICAL_ANCHOR.has(name.trim().toLowerCase());
}

function isNoiseL0(name: string, level: number | undefined): boolean {
  if (level != null && level > 0) return false;
  return NOISE_L0_WHEN_MEDICAL.has(name.trim().toLowerCase());
}

function openAlexId(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/A\d+/i);
  return m ? m[0]!.toUpperCase().replace(/^A/, "A") : raw.replace(/^https?:\/\/openalex\.org\/authors\//i, "");
}

/**
 * OpenAlex display_name 是否与 Twin 姓名一致。
 * 用于拦截 fixture/历史误绑（如 A5040172093=Austin S. Ankney 误作朱同玉）。
 */
export function openAlexDisplayMatchesHcp(
  displayName: string | undefined | null,
  nameZh: string,
  nameEn?: string | null,
): boolean {
  if (!displayName?.trim()) return false;
  const raw = displayName.trim();
  const compact = raw.toLowerCase().replace(/[\s.,'-]+/g, "");
  const zh = nameZh.trim();
  if (zh && (raw.includes(zh) || compact.includes(zh.toLowerCase()))) {
    return true;
  }
  if (nameEn?.trim()) {
    const parts = nameEn
      .toLowerCase()
      .split(/[\s,]+/)
      .map((p) => p.replace(/[^a-z]/g, ""))
      .filter((p) => p.length > 1);
    if (parts.length >= 2 && parts.every((p) => compact.includes(p))) {
      return true;
    }
  }
  return false;
}

export async function searchOpenAlexAuthors(
  http: HttpClient,
  name: string,
  hospital?: string,
): Promise<Array<{ id: string; display_name: string; institution?: string; orcid?: string | null; concepts?: string[] }>> {
  const q = encodeURIComponent(name.trim());
  const data = await http.getJson<{ results?: OpenAlexAuthor[] }>(
    `https://api.openalex.org/authors?search=${q}&per_page=5`,
  );
  const mapped = (data.results ?? [])
    .map((a) => {
      const id = openAlexId(a.id);
      if (!id) return null;
      const inst =
        a.last_known_institutions?.[0]?.display_name ??
        a.affiliations?.[0]?.institution?.display_name;
      return {
        id,
        display_name: a.display_name ?? name,
        institution: inst,
        orcid: a.orcid?.replace(/^https?:\/\/orcid\.org\//, "") ?? null,
        concepts: (a.x_concepts ?? [])
          .slice(0, 5)
          .map((c) => c.display_name)
          .filter((x): x is string => Boolean(x)),
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  // 医院 + 医学概念加权（避免同名物理/CS 作者排第一）
  const h = (hospital ?? "").toLowerCase();
  mapped.sort((a, b) => {
    const score = (row: (typeof mapped)[number]) => {
      let s = 0;
      const inst = (row.institution ?? "").toLowerCase();
      if (
        inst.includes("zhongshan") ||
        inst.includes("fudan") ||
        inst.includes("shanghai medical") ||
        h.includes("中山") ||
        h.includes("复旦")
      ) {
        s += 4;
      } else if (inst.includes("hospital") || inst.includes("medical") || inst.includes("医院")) {
        s += 2;
      } else if (inst) {
        s += 1;
      }
      const concepts = (row.concepts ?? []).map((c) => c.toLowerCase());
      if (
        concepts.some((c) =>
          /medicine|transplant|nephrology|urology|cardiology|surgery|biology|internal medicine/.test(
            c,
          ),
        )
      ) {
        s += 3;
      }
      if (
        concepts.some((c) =>
          /nuclear physics|cosmic ray|computer science|materials science/.test(c),
        )
      ) {
        s -= 2;
      }
      return s;
    };
    return score(b) - score(a);
  });
  return mapped;
}

export async function fetchOpenAlexAuthor(
  http: HttpClient,
  openalexId: string,
): Promise<OpenAlexAuthor | null> {
  const id = openAlexId(openalexId);
  if (!id) return null;
  return http.getJson<OpenAlexAuthor>(`https://api.openalex.org/authors/${id}`);
}

export async function fetchOpenAlexWorks(
  http: HttpClient,
  openalexId: string,
  perPage = 25,
): Promise<OpenAlexWork[]> {
  const id = openAlexId(openalexId);
  if (!id) return [];
  const data = await http.getJson<{ results?: OpenAlexWork[] }>(
    `https://api.openalex.org/works?filter=author.id:${id}&sort=publication_year:desc&per_page=${perPage}`,
  );
  return data.results ?? [];
}

export function authorIdsFromOpenAlex(author: OpenAlexAuthor): Partial<AuthorIds> {
  return {
    openalex: openAlexId(author.id),
    orcid: author.orcid?.replace(/^https?:\/\/orcid\.org\//, "") ?? null,
  };
}

export function careerFromOpenAlex(author: OpenAlexAuthor, asOf: string) {
  const positions_current =
    author.last_known_institutions?.map((i) => ({
      title: "Affiliation",
      org: i.display_name ?? "Unknown",
      as_of: asOf,
      confidence: "medium" as const,
      source_url: author.id ?? "https://openalex.org",
      source_type: "openalex",
    })) ?? [];

  const positions_past =
    author.affiliations
      ?.filter((a) => a.institution?.display_name)
      .slice(0, 8)
      .map((a) => ({
        title: "Past affiliation",
        org: a.institution!.display_name!,
        years: a.years,
        confidence: "medium" as const,
        source_url: author.id ?? "https://openalex.org",
        source_type: "openalex",
      })) ?? [];

  return { positions_current, positions_past };
}

export function pubsFromOpenAlexWorks(works: OpenAlexWork[]) {
  return works.slice(0, 20).map((w) => {
    const doi = w.doi?.replace(/^https?:\/\/doi\.org\//, "") ?? null;
    return {
      title: w.title ?? w.display_name ?? "Untitled",
      year: w.publication_year ?? null,
      doi,
      pmid: null as string | null,
      venue: w.primary_location?.source?.display_name ?? null,
      url: doi ? `https://doi.org/${doi}` : (w.id ?? null),
      source_type: "openalex",
      confidence: "high" as const,
    };
  });
}

/**
 * 主题排序：作者级 x_concepts 为主；works 概念仅作补充。
 * 医学作者画像下丢弃 works 上的噪声 level-0（如 Computer science），
 * 并优先 level≥1 专科概念，避免 themes[0] 被误标学科占住。
 */
export function themesFromOpenAlex(
  author: OpenAlexAuthor,
  works: OpenAlexWork[],
): string[] {
  const authorConcepts = author.x_concepts ?? [];
  const authorMedical = authorConcepts.some(
    (c) => c.display_name && isMedicalAnchor(c.display_name),
  );

  const scores = new Map<string, number>();
  const levels = new Map<string, number>();

  const bump = (name: string, delta: number, level?: number) => {
    scores.set(name, (scores.get(name) ?? 0) + delta);
    if (level != null) {
      const prev = levels.get(name);
      levels.set(name, prev == null ? level : Math.min(prev, level));
    }
  };

  // 作者画像：高权重；医学锚点再加权
  for (const c of authorConcepts) {
    if (!c.display_name) continue;
    const base = (c.score ?? 0.1) * 5;
    const medicalBoost = isMedicalAnchor(c.display_name) ? 1.5 : 1;
    const specialtyBoost = (c.level ?? 0) >= 1 ? 1.4 : 1;
    bump(c.display_name, base * medicalBoost * specialtyBoost, c.level);
  }

  // works：单篇噪声常见；医学作者时跳过无关 L0；单概念加分封顶
  const workHits = new Map<string, number>();
  for (const w of works) {
    for (const c of w.concepts ?? []) {
      if (!c.display_name) continue;
      if (authorMedical && isNoiseL0(c.display_name, c.level)) continue;
      // 非医学作者也跳过极端噪声 L0（Nuclear physics 等）若分数极低且无作者侧支撑
      if (
        isNoiseL0(c.display_name, c.level) &&
        !authorConcepts.some(
          (a) =>
            a.display_name?.toLowerCase() === c.display_name!.toLowerCase(),
        )
      ) {
        continue;
      }
      const name = c.display_name;
      workHits.set(name, (workHits.get(name) ?? 0) + 1);
      const perHit = Math.min(c.score ?? 0.2, 0.45);
      const specialtyBoost = (c.level ?? 0) >= 1 ? 1.25 : 0.6;
      bump(name, perHit * specialtyBoost, c.level);
    }
  }

  // 仅出现在 1 篇 work、且作者侧无该概念的宽泛 L0：再削一刀
  for (const [name, hits] of workHits) {
    const level = levels.get(name) ?? 0;
    const onAuthor = authorConcepts.some(
      (a) => a.display_name?.toLowerCase() === name.toLowerCase(),
    );
    if (hits === 1 && level === 0 && !onAuthor && !isMedicalAnchor(name)) {
      scores.set(name, (scores.get(name) ?? 0) * 0.25);
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => {
    const [na, sa] = a;
    const [nb, sb] = b;
    // 同分时：专科 level 优先，再医学锚点，再字典序
    if (Math.abs(sb - sa) > 1e-9) return sb - sa;
    const la = levels.get(na) ?? 0;
    const lb = levels.get(nb) ?? 0;
    if (la !== lb) return lb - la;
    const ma = isMedicalAnchor(na) ? 1 : 0;
    const mb = isMedicalAnchor(nb) ? 1 : 0;
    if (ma !== mb) return mb - ma;
    return na.localeCompare(nb);
  });

  // 医学作者：最终列表去掉噪声 L0（若仍有足够非噪声主题）
  let names = ranked.map(([n]) => n);
  if (authorMedical) {
    const cleaned = names.filter((n) => !isNoiseL0(n, levels.get(n)));
    if (cleaned.length >= 2) names = cleaned;
  }

  // 若存在 level≥1，把纯宽泛 Medicine 往后靠一点展示专科
  const specialty = names.filter((n) => (levels.get(n) ?? 0) >= 1);
  const broad = names.filter((n) => (levels.get(n) ?? 0) < 1);
  if (specialty.length > 0) {
    names = [...specialty, ...broad.filter((n) => !specialty.includes(n))];
  }

  return names.slice(0, 8);
}
