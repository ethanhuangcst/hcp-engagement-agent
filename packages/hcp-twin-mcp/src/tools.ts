import { z } from "zod";
import {
  HcpTierSchema,
  RoleTagSchema,
  SCHEMA_VERSION,
  mcpError,
  mergeOpenAlexIds,
  normalizeOpenAlexBinding,
  type AuthorIds,
  type HcpInsights,
  type McpError,
  type VirtualTwin,
} from "@hca/domain";
import type { TwinStore } from "./store.js";
import {
  ZHU_AUTHOR_IDS,
  ZHU_HCP_ID,
  ZHU_TAGS,
  buildZhuTongyuInsights,
  buildZhuTongyuTwin,
} from "./fixtures/zhu-tongyu.js";
import { applyTagOverride, ruleTagFromProfile, tagsFromTwin } from "./tagging.js";
import { createHttpClient } from "./collectors/http.js";
import { searchOpenAlexAuthors } from "./collectors/openalex.js";

export const ResolveInputSchema = z.object({
  name: z.string().min(1),
  hospital: z.string().min(1),
  dept: z.string().min(1),
  city: z.string().optional(),
});

export const GetTwinInputSchema = z.object({
  hcpId: z.string().min(1),
});

export const GetInsightsInputSchema = z.object({
  hcpId: z.string().min(1),
});

export const TagHcpInputSchema = z.object({
  hcpId: z.string().min(1),
  force_rule: z.boolean().optional(),
  override: z
    .object({
      hcp_tier: HcpTierSchema.optional(),
      role_tags: z.array(RoleTagSchema).optional(),
    })
    .optional(),
});

/** Confirm draft: scalars + optional openalex_aliases (ADR-004). */
export const AuthorIdsDraftSchema = z
  .object({
    orcid: z.string().nullable().optional(),
    pubmed_author: z.string().nullable().optional(),
    openalex: z.string().nullable().optional(),
    openalex_aliases: z.array(z.string()).optional(),
    google_scholar: z.string().nullable().optional(),
    scopus_author_id: z.string().nullable().optional(),
    wos_researcher_id: z.string().nullable().optional(),
    semantic_scholar: z.string().nullable().optional(),
    dimensions: z.string().nullable().optional(),
    cnki_scholar: z.string().nullable().optional(),
    wanfang_author: z.string().nullable().optional(),
  })
  .passthrough();

export const ConfirmAndSaveInputSchema = z.object({
  hcpId: z.string().min(1),
  name_zh: z.string().min(1).optional(),
  name_en: z.string().nullable().optional(),
  hospital: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  city: z.string().optional(),
  author_ids_draft: AuthorIdsDraftSchema.optional(),
  /** Convenience: [0]=primary openalex, rest → openalex_aliases (ADR-004). */
  openalex_ids: z.array(z.string().min(1)).optional(),
  tags_draft: z
    .object({
      hcp_tier: HcpTierSchema.optional(),
      role_tags: z.array(RoleTagSchema).optional(),
    })
    .optional(),
});

/** Merge confirm draft + openalex_ids[] into normalized AuthorIds. */
export function resolveConfirmAuthorIds(input: {
  author_ids_draft?: z.infer<typeof AuthorIdsDraftSchema>;
  openalex_ids?: string[];
  preferred_openalex?: string | null;
}): AuthorIds {
  const draft = (input.author_ids_draft ?? {}) as AuthorIds;
  const preferred =
    input.preferred_openalex ?? draft.openalex ?? input.openalex_ids?.[0] ?? null;
  if (input.openalex_ids && input.openalex_ids.length > 0) {
    const merged = mergeOpenAlexIds(input.openalex_ids, preferred);
    return normalizeOpenAlexBinding({
      ...draft,
      ...merged,
      orcid: draft.orcid ?? null,
    });
  }
  return normalizeOpenAlexBinding(draft);
}

export const HealthCheckInputSchema = z.object({});

/** 朱同玉 fixture 仅按姓名触发；禁止用「中山」医院误命中 */
export function matchesZhuFixtureName(name: string): boolean {
  const n = name.trim();
  if (n.includes("朱同玉")) return true;
  if (/tongyu/i.test(n) && /zhu/i.test(n)) return true;
  return false;
}

function mockHcpId(name: string, hospital: string): string {
  const key = `${name.trim()}|${hospital.trim()}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) >>> 0;
  return `hcp_mock_${h.toString(16)}`;
}

export type ToolOk<T> = { ok: true; data: T };
export type ToolFail = { ok: false; error: McpError };
export type ToolResult<T> = ToolOk<T> | ToolFail;

function validationFail(err: z.ZodError): ToolFail {
  return {
    ok: false,
    error: mcpError("VALIDATION_ERROR", "入参校验失败", {
      details: { issues: err.issues.map((i) => ({ path: i.path, message: i.message })) },
      repair_hint: "检查必填字段 name/hospital/dept 或 hcpId",
    }),
  };
}

export type ResolveEvidence = {
  kind: string;
  url?: string;
};

/** 人候选：姓名/机构为主标题材料；网页名只进 evidence */
export type ResolveCandidate = {
  candidate_id: string;
  name_zh: string;
  name_en?: string | null;
  hospital: string;
  department: string;
  title?: string | null;
  distinguish: string;
  confidence: "high" | "medium" | "low";
  match_note: string;
  evidence: ResolveEvidence[];
  hcpId?: string;
  author_ids_draft?: AuthorIds;
  tags_draft?: typeof ZHU_TAGS;
};

export type ResolveResult = {
  disambiguation_status: "resolved" | "ambiguous" | "unresolved";
  candidates: ResolveCandidate[];
  /** 调试/审计：mock 路径等，非 UI 主标题 */
  debug_evidence?: string[];
  persisted: false;
};

export async function resolveHcpIdentity(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<ResolveResult>> {
  const parsed = ResolveInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const { name, hospital, dept, city } = parsed.data;

  if (name.includes("无此人") || name.includes("查无")) {
    return {
      ok: true,
      data: {
        disambiguation_status: "unresolved",
        candidates: [],
        debug_evidence: ["no_public_match"],
        persisted: false,
      },
    };
  }

  // —— live：OpenAlex 公开检索（MVP-2 禁止用 fixture 冒充消歧）——
  if (store.mode === "live") {
    try {
      const http = createHttpClient();
      const hits = await searchOpenAlexAuthors(http, name, hospital);
      if (hits.length === 0) {
        return {
          ok: true,
          data: {
            disambiguation_status: "unresolved",
            candidates: [],
            debug_evidence: ["live_openalex_empty"],
            persisted: false,
          },
        };
      }
      const tags_draft = ruleTagFromProfile({
        title: undefined,
        hospital,
        roleHints: [],
      });
      const candidates: ResolveCandidate[] = hits.slice(0, 5).map((h, i) => {
        const hcpId = `hcp_${h.id.toLowerCase()}`;
        return {
          candidate_id: `c-live-${h.id}`,
          name_zh: name.trim(),
          name_en: (() => {
            const d = h.display_name?.trim();
            if (!d || /[\u4e00-\u9fff]/.test(d) || !/[A-Za-z]/.test(d)) {
              return null;
            }
            return d;
          })(),
          hospital: h.institution ?? hospital.trim(),
          department: dept.trim(),
          title: null,
          distinguish:
            h.institution
              ? `OpenAlex 机构：${h.institution}`
              : "OpenAlex 作者命中；请核医院科室",
          confidence: i === 0 ? "high" : "medium",
          match_note: `live OpenAlex · ${h.id}`,
          evidence: [
            {
              kind: "OpenAlex",
              url: `https://openalex.org/authors/${h.id}`,
            },
            ...(h.orcid
              ? [{ kind: "ORCID", url: `https://orcid.org/${h.orcid}` }]
              : []),
          ],
          hcpId,
          author_ids_draft: {
            openalex: h.id,
            orcid: h.orcid,
            pubmed_author: null,
            google_scholar: null,
            scopus_author_id: null,
            cnki_scholar: null,
          },
          tags_draft: {
            ...tags_draft,
            hcp_tier: i === 0 ? "T2" : "T3",
            tag_confidence: "medium",
          },
        };
      });
      return {
        ok: true,
        data: {
          disambiguation_status: "ambiguous",
          candidates,
          debug_evidence: ["live_openalex", `twin_mode=${store.mode}`],
          persisted: false,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: mcpError(
          "SOURCE_UNAVAILABLE",
          err instanceof Error ? err.message : String(err),
          { repair_hint: "检查外网 / OPENALEX_MAILTO / 稍后重试" },
        ),
      };
    }
  }

  // —— mock（仅 CI）：朱同玉 fixture —— 仅姓名命中 ——
  if (matchesZhuFixtureName(name)) {
    const tags_draft = ruleTagFromProfile({
      title: "主任医师 / 教授",
      hospital,
      roleHints: ["KOL", "KME", "行政", "政策"],
    });
    const openalexUrl = ZHU_AUTHOR_IDS.openalex
      ? `https://openalex.org/authors/${ZHU_AUTHOR_IDS.openalex}`
      : undefined;
    return {
      ok: true,
      data: {
        disambiguation_status: "ambiguous",
        candidates: [
          {
            candidate_id: "c-zhu-zs",
            name_zh: "朱同玉",
            name_en: "Tongyu Zhu",
            hospital: "复旦大学附属中山医院",
            department: "肾脏移植科 / 泌尿外科",
            title: "主任医师 / 教授",
            distinguish: "中山医院肾脏移植方向；与查询医院、科室一致",
            confidence: "high",
            match_note: "姓名 + 医院 + 科室均对上",
            evidence: [
              {
                kind: "医院专家页",
                url: "https://www.zs-hospital.sh.cn/",
              },
              ...(openalexUrl
                ? [{ kind: "OpenAlex", url: openalexUrl }]
                : []),
              { kind: "Google Scholar" },
            ],
            hcpId: ZHU_HCP_ID,
            author_ids_draft: ZHU_AUTHOR_IDS,
            tags_draft,
          },
          {
            candidate_id: "c-zhu-other",
            name_zh: "朱同玉",
            name_en: "Tongyu Zhu",
            hospital: "其他机构（同名待核）",
            department: "外科",
            title: "副主任医师",
            distinguish: "仅姓名相近，医院与专科不符——勿与中山肾移植合并",
            confidence: "low",
            match_note: "只有姓名对上，机构不对",
            evidence: [{ kind: "公开检索弱命中" }],
            hcpId: "hcp_zhu_tongyu_other",
            author_ids_draft: {
              orcid: "0000-0009-9999-0000",
              pubmed_author: null,
              google_scholar: null,
              openalex: null,
              scopus_author_id: null,
              cnki_scholar: null,
            },
            tags_draft: {
              hcp_tier: "T3",
              role_tags: ["frontline"],
              tag_confidence: "low",
              tag_as_of: "2026-07-17",
              tag_method: "rule",
              evidence_refs: [],
            },
          },
        ],
        debug_evidence: ["mock_fixture:zhu-tongyu", `twin_mode=${store.mode}`],
        persisted: false,
      },
    };
  }

  // 其他姓名：按查询锚点回显为「待核」人候选（mock；live 再接真检索）
  const tags_draft = ruleTagFromProfile({
    title: "待确认职称",
    hospital,
    roleHints: [],
  });
  const hcpId = mockHcpId(name, hospital);
  return {
    ok: true,
    data: {
      disambiguation_status: "ambiguous",
      candidates: [
        {
          candidate_id: `c-${hcpId}`,
          name_zh: name.trim(),
          name_en: null,
          hospital: hospital.trim(),
          department: dept.trim(),
          title: null,
          distinguish: `按你填写的姓名与机构生成的待核人选（mock；非朱同玉 fixture）`,
          confidence: "medium",
          match_note: city
            ? `查询锚点：${name.trim()} · ${hospital.trim()} · ${dept.trim()} · ${city}`
            : `查询锚点：${name.trim()} · ${hospital.trim()} · ${dept.trim()}`,
          evidence: [{ kind: "查询锚点回显（mock）" }],
          hcpId,
          author_ids_draft: {
            orcid: null,
            pubmed_author: null,
            google_scholar: null,
            openalex: null,
            scopus_author_id: null,
            cnki_scholar: null,
          },
          tags_draft: {
            ...tags_draft,
            hcp_tier: "T2",
            tag_confidence: "low",
          },
        },
      ],
      debug_evidence: ["mock_anchor_echo", `twin_mode=${store.mode}`],
      persisted: false,
    },
  };
}

function buildIdentityTwin(input: {
  hcpId: string;
  name_zh: string;
  name_en?: string | null;
  hospital: string;
  department: string;
  title?: string | null;
  city?: string;
  author_ids?: AuthorIds;
  tags_draft?: { hcp_tier?: z.infer<typeof HcpTierSchema>; role_tags?: z.infer<typeof RoleTagSchema>[] };
}): VirtualTwin {
  const asOf = new Date().toISOString().slice(0, 10);
  const authorIds = normalizeOpenAlexBinding(input.author_ids);
  const tags =
    input.tags_draft?.hcp_tier
      ? {
          hcp_tier: input.tags_draft.hcp_tier,
          role_tags: input.tags_draft.role_tags ?? [],
          tag_confidence: "low" as const,
          tag_as_of: asOf,
          tag_method: "rule" as const,
          evidence_refs: ["confirm_identity"],
        }
      : {
          hcp_tier: "T2" as const,
          role_tags: [] as z.infer<typeof RoleTagSchema>[],
          tag_confidence: "low" as const,
          tag_as_of: asOf,
          tag_method: "rule" as const,
          evidence_refs: ["confirm_identity"],
        };
  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      hcp_id: input.hcpId,
      as_of: asOf,
      twin_version: 1,
      build_mode: "full",
    },
    identity: {
      name_zh: input.name_zh,
      name_en: input.name_en ?? undefined,
      hospital: input.hospital,
      department: input.department,
      city: input.city,
      title: input.title ?? undefined,
    },
    profile: {
      name_zh: input.name_zh,
      name_en: input.name_en ?? undefined,
      hospital: input.hospital,
      department: input.department,
      city: input.city,
      title: input.title ?? undefined,
      // ambiguous：无活跃 P0 文献号时仍可落身份（A9 仅约束 resolved）
      disambiguation_status: "ambiguous",
      specialties: [],
      external_ids: authorIds,
      tags,
    },
    research: {
      author_ids: authorIds,
      themes: [],
    },
  };
}

/** BFF「确认并保存」：写入 Twin + Insights（resolve 本身不落库）. */
export async function confirmAndSaveTwin(
  store: TwinStore,
  raw: unknown = { hcpId: ZHU_HCP_ID },
): Promise<ToolResult<{ hcpId: string }>> {
  const parsed =
    typeof raw === "string"
      ? ConfirmAndSaveInputSchema.safeParse({ hcpId: raw })
      : ConfirmAndSaveInputSchema.safeParse(raw ?? {});
  if (!parsed.success) return validationFail(parsed.error);

  const input = parsed.data;
  const { hcpId } = input;

  // 仅主 fixture hcpId 写完整朱同玉；其它人（含同名弱候选）按确认身份落库
  if (hcpId === ZHU_HCP_ID) {
    const twin = buildZhuTongyuTwin();
    await store.upsertTwin(twin);
    const insights = buildZhuTongyuInsights();
    await store.upsertInsights(insights);
    return { ok: true, data: { hcpId: ZHU_HCP_ID } };
  }

  if (!input.name_zh || !input.hospital || !input.department) {
    return {
      ok: false,
      error: mcpError(
        "VALIDATION_ERROR",
        "确认非 fixture 人选时须提供 name_zh / hospital / department",
        {
          repair_hint: "BFF 应从所选候选回传身份字段",
        },
      ),
    };
  }

  const authorIds = resolveConfirmAuthorIds({
    author_ids_draft: input.author_ids_draft,
    openalex_ids: input.openalex_ids,
    preferred_openalex: input.author_ids_draft?.openalex ?? null,
  });

  const twin = buildIdentityTwin({
    hcpId,
    name_zh: input.name_zh,
    name_en: input.name_en,
    hospital: input.hospital,
    department: input.department,
    title: input.title,
    city: input.city,
    author_ids: authorIds,
    tags_draft: input.tags_draft,
  });
  await store.upsertTwin(twin);
  const insights: HcpInsights = {
    hcp_id: hcpId,
    as_of: twin.meta.as_of,
    interest_directions: [],
    opportunities: [],
  };
  await store.upsertInsights(insights);
  return { ok: true, data: { hcpId } };
}

export async function getTwinTool(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<unknown>> {
  const parsed = GetTwinInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const twin = await store.getTwin(parsed.data.hcpId);
  if (!twin) {
    return {
      ok: false,
      error: mcpError("NOT_FOUND", `未找到 Twin: ${parsed.data.hcpId}`, {
        repair_hint: "先 resolve 并由 BFF 确认保存后再 get_twin",
      }),
    };
  }
  return { ok: true, data: twin };
}

export async function getInsightsTool(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<unknown>> {
  const parsed = GetInsightsInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const row = await store.getInsights(parsed.data.hcpId);
  if (!row) {
    return {
      ok: false,
      error: mcpError("NOT_FOUND", `未找到 Insights: ${parsed.data.hcpId}`, {
        repair_hint: "确认保存分身后可读取 Insights",
      }),
    };
  }
  return { ok: true, data: row };
}

export async function tagHcpTool(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<{ tags: unknown }>> {
  const parsed = TagHcpInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const twin = await store.getTwin(parsed.data.hcpId);
  if (!twin) {
    return {
      ok: false,
      error: mcpError("NOT_FOUND", `未找到 Twin: ${parsed.data.hcpId}`, {
        repair_hint: "tag_hcp 须在 Twin 已入库后调用",
      }),
    };
  }

  const ruleTags = tagsFromTwin(twin);
  const tags = applyTagOverride(
    twin.profile.tags,
    parsed.data.override ?? {},
    parsed.data.force_rule === true,
    ruleTags,
  );

  const updated = await store.updateTags(parsed.data.hcpId, tags);
  if (!updated) {
    return {
      ok: false,
      error: mcpError("INTERNAL_ERROR", "写入 tags 失败", { retryable: true }),
    };
  }
  return { ok: true, data: { tags } };
}

export async function healthCheckTool(
  store: TwinStore,
  raw: unknown = {},
): Promise<
  ToolResult<{
    ok: boolean;
    database_ok: boolean;
    twin_mode: string;
    playwright: "ready" | "skip" | "down";
    version: string;
  }>
> {
  const parsed = HealthCheckInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const database_ok = await store.ping();
  return {
    ok: true,
    data: {
      ok: true,
      database_ok,
      twin_mode: store.mode,
      playwright: "skip",
      version: "0.2.0",
    },
  };
}

export { ZHU_HCP_ID, ZHU_TAGS, buildZhuTongyuTwin };
