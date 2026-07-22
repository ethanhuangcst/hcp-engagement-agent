/**
 * One-shot bilingual fill:
 * - Keep/migrate Chinese narrative into locales["zh-CN"]
 * - Translate into locales.en (does not delete zh)
 * - Fill research.themes_i18n.en when themes are CJK
 * - Backfill Latin name_en from OpenAlex display when missing
 * - Refresh doing_now into en bucket via synthesizeDoingNow
 *
 * Usage (repo root):
 *   npm run translate:en -w @hca/hcp-engagement-agent
 *   npm run translate:en -w @hca/hcp-engagement-agent -- --hcpId=hcp_xxx
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import {
  getInsights,
  getTwin,
  listTwins,
  upsertInsights,
  upsertTwin,
} from "@hca/db";
import {
  pickInsightsNarrative,
  topLevelNarrative,
  withInsightsLocale,
  type HcpInsights,
  type VirtualTwin,
} from "@hca/domain";
import { pinyin } from "pinyin-pro";
import { createLlmClient } from "../llm.js";
import { extractJsonObject } from "../json.js";
import { synthesizeDoingNow } from "../synthesize.js";

function loadRootEnv(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const path = join(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  process.chdir(root);
}

function hasCjk(s: unknown): boolean {
  return typeof s === "string" && /[\u4e00-\u9fff]/.test(s);
}

function isLatinNameEn(value: string | null | undefined): boolean {
  const s = value?.trim();
  if (!s) return false;
  if (/[\u4e00-\u9fff]/.test(s)) return false;
  return /[A-Za-z]/.test(s);
}

const TRANSLATE_SYSTEM = `You translate China-market HCP engagement insight JSON into clear English.
Rules:
1. Translate human-readable narrative fields (titles, notes, analysis, summary, evidence names/labels).
2. Keep structure, ids, URLs, dates, confidence enums, evidence_refs paths, priority values.
3. Do not invent clinical claims, Rx, or private contacts.
4. Output one JSON object only with keys: doing_now, interest_directions, opportunities, evidence (same shapes).`;

async function translateNarrative(
  insights: HcpInsights,
): Promise<NonNullable<HcpInsights["locales"]>["en"]> {
  const llm = createLlmClient();
  if ("error" in llm) throw llm.error;
  const zh = pickInsightsNarrative(insights, "zh-CN");
  const payload = {
    doing_now: zh.doing_now,
    interest_directions: zh.interest_directions,
    opportunities: zh.opportunities,
    evidence: zh.evidence,
  };
  const result = await llm.chat([
    { role: "system", content: TRANSLATE_SYSTEM },
    {
      role: "user",
      content: `Translate to English:\n${JSON.stringify(payload, null, 2)}`,
    },
  ]);
  const json = extractJsonObject(result.content) as Record<string, unknown>;
  return {
    doing_now:
      json.doing_now && typeof json.doing_now === "object"
        ? {
            summary:
              String(
                (json.doing_now as { summary?: string }).summary ??
                  zh.doing_now?.summary ??
                  "",
              ) || "Public evidence summary pending.",
            analysis: (json.doing_now as { analysis?: string }).analysis,
            evidence_refs: (json.doing_now as { evidence_refs?: string[] })
              .evidence_refs,
            confidence: (json.doing_now as { confidence?: "high" | "medium" | "low" })
              .confidence,
            as_of:
              (json.doing_now as { as_of?: string }).as_of ??
              zh.doing_now?.as_of ??
              insights.as_of,
            locale: "en",
          }
        : zh.doing_now
          ? { ...zh.doing_now, locale: "en" }
          : undefined,
    interest_directions:
      (json.interest_directions as HcpInsights["interest_directions"]) ??
      zh.interest_directions,
    opportunities:
      (json.opportunities as HcpInsights["opportunities"]) ??
      zh.opportunities,
    evidence:
      (json.evidence as HcpInsights["evidence"]) ?? zh.evidence,
  };
}

async function translateThemes(themes: string[]): Promise<string[]> {
  if (themes.length === 0) return [];
  if (!themes.some(hasCjk)) return themes;
  const llm = createLlmClient();
  if ("error" in llm) throw llm.error;
  const result = await llm.chat([
    {
      role: "system",
      content:
        'Translate research theme labels to concise English. Output JSON: {"themes":["..."]}',
    },
    { role: "user", content: JSON.stringify({ themes }) },
  ]);
  const json = extractJsonObject(result.content) as { themes?: string[] };
  return Array.isArray(json.themes) && json.themes.length
    ? json.themes.map(String)
    : themes;
}

function chineseToGivenFamily(nameZh: string): string | undefined {
  const chars = [...nameZh.trim()].filter((c) => /[\u4e00-\u9fff]/.test(c));
  if (chars.length < 2) return undefined;
  const surnamePy = pinyin(chars[0]!, { toneType: "none", type: "array" })[0];
  const givenPy = chars
    .slice(1)
    .map((c) => pinyin(c, { toneType: "none", type: "array" })[0] ?? "")
    .join("");
  if (!surnamePy || !givenPy) return undefined;
  const cap = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return `${cap(givenPy)} ${cap(surnamePy)}`;
}

async function fetchAuthorDisplay(openalex: string): Promise<string | undefined> {
  const id = String(openalex).replace(/^https?:\/\/openalex\.org\/authors\//i, "");
  const res = await fetch(`https://api.openalex.org/authors/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { display_name?: string };
  return data.display_name?.trim();
}

async function searchLatinDisplay(nameEnQuery: string): Promise<{
  display_name: string;
  id: string;
} | null> {
  const q = encodeURIComponent(nameEnQuery);
  const res = await fetch(
    `https://api.openalex.org/authors?search=${q}&per_page=5`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results?: Array<{ id?: string; display_name?: string }>;
  };
  for (const a of data.results ?? []) {
    const d = a.display_name?.trim();
    if (d && isLatinNameEn(d)) {
      const id = String(a.id ?? "").replace(
        /^https?:\/\/openalex\.org\/authors\//i,
        "",
      );
      return { display_name: d, id };
    }
  }
  return null;
}

async function backfillNameEn(twin: VirtualTwin): Promise<VirtualTwin> {
  const existing = twin.profile.name_en ?? twin.identity?.name_en;
  if (isLatinNameEn(existing)) return twin;

  let latin: string | undefined;
  let nextOpenalex: string | undefined;
  const openalex =
    twin.research?.author_ids?.openalex ?? twin.profile.external_ids?.openalex;

  try {
    if (openalex) {
      const d = await fetchAuthorDisplay(String(openalex));
      if (isLatinNameEn(d)) latin = d;
    }
    if (!latin) {
      const roman = chineseToGivenFamily(twin.profile.name_zh);
      if (roman) {
        const hit = await searchLatinDisplay(roman);
        if (hit) {
          latin = hit.display_name;
          // Rebind when current cluster is CN-only (no Latin display).
          if (openalex) {
            const cur = await fetchAuthorDisplay(String(openalex));
            if (!isLatinNameEn(cur)) nextOpenalex = hit.id;
          } else {
            nextOpenalex = hit.id;
          }
        }
      }
    }
  } catch {
    return twin;
  }

  if (!latin) return twin;

  const authorIds = {
    ...(twin.research?.author_ids ?? twin.profile.external_ids ?? {}),
    ...(nextOpenalex ? { openalex: nextOpenalex } : {}),
  };
  return {
    ...twin,
    identity: twin.identity
      ? { ...twin.identity, name_en: latin }
      : twin.identity,
    profile: {
      ...twin.profile,
      name_en: latin,
      external_ids: { ...twin.profile.external_ids, ...authorIds },
    },
    research: {
      ...(twin.research ?? {}),
      author_ids: authorIds,
    },
  };
}

async function main(): Promise<void> {
  loadRootEnv();
  const arg = process.argv.find((a) => a.startsWith("--hcpId="));
  const onlyId = arg?.slice("--hcpId=".length)?.trim();

  const twins = await listTwins();
  const targets = onlyId
    ? twins.filter((t) => t.hcp_id === onlyId)
    : twins;

  if (targets.length === 0) {
    console.error(onlyId ? `No twin: ${onlyId}` : "No twins in database");
    process.exit(1);
  }

  console.log(`Bilingual fill for ${targets.length} HCP(s)…`);

  for (const row of targets) {
    const hcpId = row.hcp_id;
    let twin = await getTwin(hcpId);
    if (!twin) {
      console.warn(`skip ${hcpId}: twin missing`);
      continue;
    }

    try {
      twin = await backfillNameEn(twin);
      const themes = twin.research?.themes ?? [];
      if (themes.some(hasCjk) && !(twin.research?.themes_i18n?.en?.length)) {
        const enThemes = await translateThemes(themes);
        twin = {
          ...twin,
          research: {
            ...twin.research,
            themes,
            themes_i18n: {
              ...twin.research?.themes_i18n,
              "zh-CN": twin.research?.themes_i18n?.["zh-CN"] ?? themes,
              en: enThemes,
            },
          },
        };
        console.log(`ok themes_i18n ${hcpId}`);
      }
      await upsertTwin(twin);

      let insights = await getInsights(hcpId);
      if (!insights) {
        console.warn(`skip insights ${hcpId}: none`);
      } else {
        // Ensure zh bucket exists from top-level / legacy
        if (!insights.locales?.["zh-CN"]?.doing_now?.summary) {
          const zh = topLevelNarrative(insights);
          if (zh.doing_now?.summary || zh.interest_directions?.length) {
            insights = withInsightsLocale(insights, "zh-CN", {
              ...zh,
              doing_now: zh.doing_now
                ? { ...zh.doing_now, locale: "zh-CN" }
                : zh.doing_now,
            });
          }
        }
        const enNarrative = await translateNarrative(insights);
        insights = withInsightsLocale(insights, "en", enNarrative ?? {});
        // Restore zh top-level display default after withInsightsLocale synced en to top
        const zhKeep = insights.locales?.["zh-CN"];
        if (zhKeep) {
          insights = {
            ...insights,
            doing_now: zhKeep.doing_now,
            interest_directions: zhKeep.interest_directions,
            opportunities: zhKeep.opportunities,
            evidence: zhKeep.evidence,
            locales: insights.locales,
          };
        }
        await upsertInsights(insights);
        console.log(`ok locales ${hcpId}`);

        await synthesizeDoingNow({
          hcpId,
          refresh: true,
          locale: "en",
        });
        // Re-assert zh top-level after en synthesize
        const again = await getInsights(hcpId);
        if (again?.locales?.["zh-CN"]) {
          const zh = again.locales["zh-CN"];
          await upsertInsights({
            ...again,
            doing_now: zh.doing_now,
            interest_directions: zh.interest_directions,
            opportunities: zh.opportunities,
            evidence: zh.evidence,
          });
        }
        console.log(`ok doing_now en bucket ${hcpId}`);
      }
    } catch (err) {
      console.error(`fail ${hcpId}:`, err);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
