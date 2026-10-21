import {
  AuthorIdsSchema,
  SCHEMA_VERSION,
  type AuthorIds,
  type HcpInsights,
  type HcpTags,
  type TwinIdentity,
  type VirtualTwin,
} from "@hca/domain";
import type { RowDataPacket } from "mysql2/promise";
import { asJson, getPool } from "./client.js";
import {
  AGENT_GENERAL_HCP_ID,
  getTwin,
  nameMatchTier,
  normalizeCompare,
  upsertInsights,
  upsertTwin,
  type NameMatchTier,
} from "./twins.js";

/** ADR-009 疑似同人条目（未写库时返回给调用方人工确认） */
export type PossibleDuplicate = {
  hcp_id: string;
  name_zh: string;
  hospital: string;
  department: string;
  match_tier: NameMatchTier;
};

export type ConfirmAndSaveInput = {
  hcp_id: string;
  name_zh: string;
  name_en?: string | null;
  hospital: string;
  department: string;
  title?: string | null;
  city?: string;
  /** 候选携带的文献号（ADR-004：openalex 主 ID + openalex_aliases） */
  author_ids?: AuthorIdsInput;
  /** 确认疑似同人确非重复后强制写入；hcp_id 精确查重不受影响 */
  confirm_not_duplicate?: boolean;
  /** MCP2-10（DEF-006，D2）：科室来源留痕追加项（如 department_signal / department_checked），落 tags.evidence_refs */
  extra_evidence_refs?: string[];
};

export type ConfirmAndSaveResult =
  | { status: "saved"; twin: VirtualTwin; hcp_id: string }
  | {
      status: "confirmation_required";
      possible_duplicates: PossibleDuplicate[];
      truncated: boolean;
    }
  | {
      status: "invalid";
      code: "VALIDATION_ERROR";
      message: string;
      repair_hint: string;
    };

const MAX_DUPLICATES = 20;

function invalid(message: string, repair_hint: string): ConfirmAndSaveResult {
  return { status: "invalid", code: "VALIDATION_ERROR", message, repair_hint };
}

/** 候选载荷的文献号：结构化 AuthorIds 或内部 MCP 的自由键值草稿 */
export type AuthorIdsInput = AuthorIds | Record<string, string | null | undefined>;

/** ADR-004 归一：openalex 为主 ID，openalex_aliases 去重且不含主 ID */
export function normalizeAuthorIds(
  input: AuthorIdsInput | undefined,
): AuthorIds | undefined {
  if (!input) return undefined;
  const parsed = AuthorIdsSchema.parse(input);
  const aliases = Array.from(
    new Set(
      (parsed.openalex_aliases ?? []).map((a) => a.trim()).filter(Boolean),
    ),
  );
  const primary = parsed.openalex?.trim();
  const cleanedAliases = primary
    ? aliases.filter((a) => a !== primary)
    : aliases;
  const next: AuthorIds = { ...parsed };
  if (cleanedAliases.length > 0) next.openalex_aliases = cleanedAliases;
  else delete next.openalex_aliases;
  return next;
}

/** 疑似同人排序：医院+科室归一相同 → 仅医院相同 → 姓名档位升序 → 查出顺序 */
function sortDuplicates(
  hits: { dup: PossibleDuplicate; order: number; identity: TwinIdentity }[],
  input: ConfirmAndSaveInput,
): PossibleDuplicate[] {
  const inHosp = normalizeCompare(input.hospital);
  const inDept = normalizeCompare(input.department);
  return hits
    .sort((a, b) => {
      const aHosp = normalizeCompare(a.identity.hospital) === inHosp;
      const bHosp = normalizeCompare(b.identity.hospital) === inHosp;
      const aDept = normalizeCompare(a.identity.department) === inDept;
      const bDept = normalizeCompare(b.identity.department) === inDept;
      const aOrg = aHosp && aDept ? 0 : aHosp ? 1 : 2;
      const bOrg = bHosp && bDept ? 0 : bHosp ? 1 : 2;
      return aOrg - bOrg || a.dup.match_tier - b.dup.match_tier || a.order - b.order;
    })
    .map((h) => h.dup);
}

function identityTwin(input: ConfirmAndSaveInput, authorIds: AuthorIds | undefined): VirtualTwin {
  const asOf = new Date().toISOString().slice(0, 10);
  const tags: HcpTags = {
    hcp_tier: "T2",
    role_tags: [],
    tag_confidence: "low",
    tag_as_of: asOf,
    tag_method: "rule",
    /** MCP2-10（DEF-006，D2）：confirm_identity 之后按来源追加（department_signal / department_checked 等） */
    evidence_refs: [
      "confirm_identity",
      ...(input.extra_evidence_refs ?? []),
    ],
  };
  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      hcp_id: input.hcp_id,
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

/**
 * 确认保存（ADR-009 + ADR-010 候选令牌下游）：
 * hcp_id 精确查重 → 同名模糊查重（可 confirm_not_duplicate 绕过）→ identity twin + 空 insights。
 * handler 与 Web BFF 共用；handler 只组入参与映射错误。
 */
export async function confirmAndSaveTwin(
  input: ConfirmAndSaveInput,
): Promise<ConfirmAndSaveResult> {
  const hcpId = input.hcp_id?.trim();
  const nameZh = input.name_zh?.trim();
  const hospital = input.hospital?.trim();
  const department = input.department?.trim();
  if (!hcpId || !nameZh || !hospital || !department) {
    return invalid(
      "add_hcp 需要 hcp_id / name_zh / hospital / department",
      "检查候选载荷是否完整；缺字段时重新 query_hcp 检出候选",
    );
  }
  if (hcpId === AGENT_GENERAL_HCP_ID) {
    return invalid("_agent_general 为系统占位编号，不可用于新增", "换用候选派生的 hcp_id");
  }

  const existing = await getTwin(hcpId);
  if (existing) {
    return invalid(
      `编号 ${hcpId} 已存在，不覆盖已有 Twin`,
      "更新走 Web 编辑或等待 TWIN2-01 定时刷新",
    );
  }

  const nameEn = input.name_en?.trim();
  if (!input.confirm_not_duplicate) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT hcp_id, twin, identity FROM hcp_twins WHERE hcp_id <> ?`,
      [AGENT_GENERAL_HCP_ID],
    );
    const hits: {
      dup: PossibleDuplicate;
      order: number;
      identity: TwinIdentity;
    }[] = [];
    let order = 0;
    for (const row of rows as RowDataPacket[]) {
      const identity = asJson<TwinIdentity>(row.identity);
      const tierZh = nameMatchTier(nameZh, identity);
      const tierEn =
        nameEn && nameEn.length > 0 ? nameMatchTier(nameEn, identity) : null;
      const tier = tierZh ?? tierEn;
      if (tier === null) continue;
      hits.push({
        dup: {
          hcp_id: String(row.hcp_id),
          name_zh: identity.name_zh,
          hospital: identity.hospital,
          department: identity.department,
          match_tier: tier,
        },
        order: order++,
        identity,
      });
    }
    if (hits.length > 0) {
      const sorted = sortDuplicates(hits, input);
      return {
        status: "confirmation_required",
        possible_duplicates: sorted.slice(0, MAX_DUPLICATES),
        truncated: sorted.length > MAX_DUPLICATES,
      };
    }
  }

  const authorIds = normalizeAuthorIds(input.author_ids);
  const twin = identityTwin({ ...input, hcp_id: hcpId }, authorIds);
  const saved = await upsertTwin(twin);
  const insights: HcpInsights = {
    hcp_id: hcpId,
    as_of: twin.meta.as_of,
    interest_directions: [],
    opportunities: [],
  };
  await upsertInsights(insights);
  return { status: "saved", twin: saved, hcp_id: hcpId };
}