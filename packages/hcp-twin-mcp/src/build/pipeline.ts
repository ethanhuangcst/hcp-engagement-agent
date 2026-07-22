import {
  allOpenAlexIds,
  assertAuthorIdsForLiteratureIngest,
  bindOpenAlexId,
  hasActiveP0AuthorId,
  normalizeOpenAlexBinding,
  type VirtualTwin,
} from "@hca/domain";
import type { TwinStore } from "../store.js";
import { ruleTagFromProfile } from "../tagging.js";
import { createHttpClient, type HttpClient } from "../collectors/http.js";
import { collectCareerLive } from "../collectors/career.js";
import { collectHeatmapLive } from "../collectors/heatmap.js";
import { deriveInsightsDraft } from "../collectors/insights-draft.js";
import {
  authorIdsFromOpenAlex,
  dedupeOpenAlexWorks,
  fetchOpenAlexAuthor,
  fetchOpenAlexWorks,
  openAlexDisplayMatchesHcp,
  pubsFromOpenAlexWorks,
  searchOpenAlexAuthors,
  themesFromOpenAlex,
  type OpenAlexWork,
} from "../collectors/openalex.js";
import { fetchOrcidWorksCount } from "../collectors/orcid.js";
import { enrichPmidByDoi, searchPubmedAuthorCluster } from "../collectors/pubmed.js";
import {
  backfillNameEn,
  chineseToGivenFamily,
  effectiveNameEn,
} from "./name-en.js";
import { BuildQueue } from "./queue.js";
import type { BuildStatus } from "./types.js";

export type PipelineDeps = {
  store: TwinStore;
  http?: HttpClient;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function hospitalUrlFromTwin(twin: VirtualTwin): string | null {
  const career = twin.career as { hospital_page?: { source_url?: string } } | undefined;
  if (career?.hospital_page?.source_url) return career.hospital_page.source_url;
  // 常见中山医院入口（公开）
  if ((twin.profile.hospital ?? "").includes("中山")) {
    return "https://www.zs-hospital.sh.cn/";
  }
  return null;
}

export async function runBuildStages(
  deps: PipelineDeps,
  status: BuildStatus,
  update: (patch: Partial<BuildStatus>) => void,
): Promise<void> {
  const http = deps.http ?? createHttpClient();
  const asOf = today();
  const existing = await deps.store.getTwin(status.hcpId);
  if (!existing) {
    throw new Error(`Twin 不存在: ${status.hcpId}；请先 confirm_and_save_twin`);
  }
  let twin: VirtualTwin = existing;

  // —— Stage A：身份锚点 + AuthorIds + tagging ——
  update({ phase: "identity", message: "Stage A：锁定身份与文献号" });
  const nameZh = twin.profile.name_zh;
  // CJK-as-name_en is garbage (often copied from OpenAlex CN clusters); treat as empty.
  let nameEn = effectiveNameEn(
    twin.profile.name_en ?? twin.identity?.name_en,
  );
  /** OpenAlex Latin display_name for backfill when name_en is empty (F-WEB-047). */
  let openAlexDisplayName: string | undefined;
  let authorIds = normalizeOpenAlexBinding(
    twin.research?.author_ids ?? twin.profile.external_ids ?? {},
  );

  /** Capture Latin Given Family name only; never overwrite Latin; reject CJK. */
  const adoptMatchedDisplayName = (display: string | null | undefined) => {
    if (nameEn || openAlexDisplayName) return;
    const latin = effectiveNameEn(display);
    if (latin) openAlexDisplayName = latin;
  };

  const resolveOpenAlex = async () => {
    const hits = await searchOpenAlexAuthors(
      http,
      nameEn || nameZh,
      twin.profile.hospital,
    );
    const best =
      hits.find((h) => openAlexDisplayMatchesHcp(h.display_name, nameZh, nameEn)) ??
      hits[0];
    if (best && openAlexDisplayMatchesHcp(best.display_name, nameZh, nameEn)) {
      authorIds = {
        ...authorIds,
        openalex: best.id,
        orcid: best.orcid ?? authorIds.orcid ?? null,
      };
      adoptMatchedDisplayName(best.display_name);
      return;
    }
    // 无一姓名匹配命中：清空错误 openalex，避免灌入他人文献
    if (authorIds.openalex) {
      authorIds = { ...authorIds, openalex: null };
    }
  };

  if (!authorIds.openalex) {
    await resolveOpenAlex();
  } else {
    const author = await fetchOpenAlexAuthor(http, authorIds.openalex);
    if (
      !author ||
      !openAlexDisplayMatchesHcp(author.display_name, nameZh, nameEn)
    ) {
      // 误绑（如 fixture A5040172093=Austin S. Ankney）→ 重消歧
      authorIds = { ...authorIds, openalex: null };
      await resolveOpenAlex();
    } else {
      authorIds = { ...authorIds, ...authorIdsFromOpenAlex(author) };
      adoptMatchedDisplayName(author.display_name);
    }
  }

  if (authorIds.openalex) {
    const author = await fetchOpenAlexAuthor(http, authorIds.openalex);
    if (author) {
      authorIds = { ...authorIds, ...authorIdsFromOpenAlex(author) };
      if (openAlexDisplayMatchesHcp(author.display_name, nameZh, nameEn)) {
        adoptMatchedDisplayName(author.display_name);
      }
    }
  }

  // Backfill name_en from trusted OpenAlex display_name (Given Family); never overwrite Latin.
  nameEn = backfillNameEn(nameEn, openAlexDisplayName);

  // CN-only OpenAlex clusters have no Latin display_name — search pinyin Given Family.
  if (!nameEn) {
    const roman = chineseToGivenFamily(nameZh);
    if (roman) {
      const hits = await searchOpenAlexAuthors(
        http,
        roman,
        twin.profile.hospital,
      );
      const best =
        hits.find((h) =>
          openAlexDisplayMatchesHcp(h.display_name, nameZh, roman),
        ) ?? hits.find((h) => effectiveNameEn(h.display_name));
      const latin = best ? effectiveNameEn(best.display_name) : undefined;
      if (best && latin) {
        adoptMatchedDisplayName(best.display_name);
        nameEn = backfillNameEn(nameEn, openAlexDisplayName);
        // Prefer Latin as primary; keep prior cluster in openalex_aliases (ADR-004).
        let currentIsLatin = false;
        if (authorIds.openalex) {
          const cur = await fetchOpenAlexAuthor(http, String(authorIds.openalex));
          currentIsLatin = Boolean(effectiveNameEn(cur?.display_name));
        }
        if (!currentIsLatin) {
          authorIds = bindOpenAlexId(authorIds, best.id, { promote: true });
          authorIds = {
            ...authorIds,
            orcid: best.orcid ?? authorIds.orcid ?? null,
          };
        } else {
          authorIds = bindOpenAlexId(authorIds, best.id, { promote: false });
          authorIds = {
            ...authorIds,
            orcid: best.orcid ?? authorIds.orcid ?? null,
          };
        }
      }
    }
  }

  if (authorIds.orcid) {
    await fetchOrcidWorksCount(http, authorIds.orcid);
  }

  if (!authorIds.pubmed_author && nameEn) {
    try {
      const pm = await searchPubmedAuthorCluster(http, nameEn);
      if (pm.pubmed_author) authorIds.pubmed_author = pm.pubmed_author;
    } catch {
      /* PubMed 可选 */
    }
  }

  const tags = ruleTagFromProfile({
    title: twin.profile.title,
    hospital: twin.profile.hospital,
    roleHints: twin.profile.role_labels ?? [],
  });
  // 尊重 user_override
  const nextTags =
    twin.profile.tags?.tag_method === "user_override" && status.mode === "incremental"
      ? twin.profile.tags
      : { ...tags, tag_as_of: asOf };

  twin = {
    ...twin,
    meta: {
      ...twin.meta,
      as_of: asOf,
      twin_version: (twin.meta.twin_version ?? 0) + 1,
      build_mode: status.mode,
      built_at: new Date().toISOString(),
    },
    identity: twin.identity
      ? {
          ...twin.identity,
          name_en: nameEn ?? effectiveNameEn(twin.identity.name_en),
        }
      : twin.identity,
    profile: {
      ...twin.profile,
      name_en: nameEn,
      disambiguation_status: hasActiveP0AuthorId(authorIds)
        ? "resolved"
        : twin.profile.disambiguation_status,
      external_ids: authorIds,
      tags: nextTags,
    },
    research: {
      ...(twin.research ?? {}),
      author_ids: authorIds,
    },
  };
  await deps.store.upsertTwin(twin);

  // —— Stage B：职业 ——
  update({ phase: "career", message: "Stage B：采集职业轨迹" });
  const career = await collectCareerLive(http, {
    openalexId: authorIds.openalex,
    hospitalUrl: hospitalUrlFromTwin(twin),
    asOf,
  });
  twin = {
    ...twin,
    career: {
      ...(typeof twin.career === "object" && twin.career ? twin.career : {}),
      ...career,
    },
  };
  // F-MCP-029：职业刷新后重打标（尊重 user_override）
  if (twin.profile.tags?.tag_method !== "user_override") {
    twin = {
      ...twin,
      profile: {
        ...twin.profile,
        tags: {
          ...ruleTagFromProfile({
            title: twin.profile.title,
            hospital: twin.profile.hospital,
            roleHints: twin.profile.role_labels ?? [],
          }),
          tag_as_of: asOf,
        },
      },
    };
  }
  await deps.store.upsertTwin(twin);

  // —— Stage C：科研 ——
  update({ phase: "research", message: "Stage C：文献与主题" });
  const gate = assertAuthorIdsForLiteratureIngest(
    twin.profile.disambiguation_status,
    twin.research?.author_ids,
  );
  if (!gate.ok) {
    twin = {
      ...twin,
      research: {
        ...(twin.research ?? {}),
        author_ids: authorIds,
        themes: [],
        recent_pubs: [],
      },
    };
    // 门禁详情写入 activity 旁注，避免撑破 Research schema
    twin.activity = {
      ...(typeof twin.activity === "object" && twin.activity ? twin.activity : {}),
      ingest_skipped: {
        code: gate.code,
        message: gate.message,
        repair_hint: gate.repair_hint,
      },
    };
    await deps.store.upsertTwin(twin);
  } else {
    const openalexIds = allOpenAlexIds(authorIds);
    const collected: OpenAlexWork[] = [];
    let author: Awaited<ReturnType<typeof fetchOpenAlexAuthor>> = null;
    for (const openalexId of openalexIds) {
      if (!author) author = await fetchOpenAlexAuthor(http, openalexId);
      const works = await fetchOpenAlexWorks(http, openalexId, 25);
      collected.push(...works);
    }
    const works = dedupeOpenAlexWorks(collected);
    const pubs = pubsFromOpenAlexWorks(works);
    // DOI → PMID 补齐（限前 5 篇，控配额）
    for (const p of pubs.slice(0, 5)) {
      if (p.doi && !p.pmid) {
        try {
          p.pmid = await enrichPmidByDoi(http, p.doi);
        } catch {
          /* ignore */
        }
      }
    }
    const themes = author ? themesFromOpenAlex(author, works) : [];
    twin = {
      ...twin,
      research: {
        ...(twin.research ?? {}),
        author_ids: authorIds,
        recent_pubs: pubs,
        themes,
      },
    };
    twin.activity = {
      ...(typeof twin.activity === "object" && twin.activity ? twin.activity : {}),
      trend_shift:
        themes.length >= 2
          ? `公开概念权重靠前：${themes.slice(0, 3).join(" · ")}`
          : undefined,
      lab_affiliations:
        (career.positions_current as Array<{ org?: string }>)
          ?.map((p) => p.org)
          .filter((x): x is string => Boolean(x)) ?? [],
      openalex_ids_used: openalexIds,
      openalex_works_raw: collected.length,
      openalex_works_deduped: works.length,
    };
    await deps.store.upsertTwin(twin);
  }

  // —— Stage D：热力（失败不阻断）——
  update({ phase: "heatmap", message: "Stage D：活动热力 / 试验旁证" });
  let activity: Awaited<ReturnType<typeof collectHeatmapLive>>;
  try {
    activity = await collectHeatmapLive(http, {
      name_zh: nameZh,
      name_en: nameEn,
    });
  } catch {
    activity = {
      events: [],
      windows: {
        earlier: {
          event_ids: [],
          event_count: 0,
          no_public_evidence: true,
          note: "heatmap collector failed",
        },
        d90: {
          event_ids: [],
          event_count: 0,
          no_public_evidence: true,
          note: "heatmap collector failed",
        },
        d60: {
          event_ids: [],
          event_count: 0,
          no_public_evidence: true,
          note: "heatmap collector failed",
        },
        d30: {
          event_ids: [],
          event_count: 0,
          no_public_evidence: true,
          note: "heatmap collector failed",
        },
      },
      last_polled_at: new Date().toISOString(),
      trials: [],
      no_public_evidence: true,
    };
  }
  twin = {
    ...twin,
    activity: {
      ...(typeof twin.activity === "object" && twin.activity ? twin.activity : {}),
      events: activity.events,
      windows: activity.windows,
      last_polled_at: activity.last_polled_at,
      trials: activity.trials,
    },
  };
  await deps.store.upsertTwin(twin);

  // —— Stage E：Insights 草稿 ——
  update({ phase: "insights", message: "Stage E：Insights 草稿" });
  const insights = deriveInsightsDraft(twin, activity);
  await deps.store.upsertInsights(insights);
  await deps.store.upsertTwin(twin);
}

export function createBuildQueue(deps: PipelineDeps): BuildQueue {
  return new BuildQueue((status, update) => runBuildStages(deps, status, update));
}
