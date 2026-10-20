import {
  HcpInsightsSchema,
  VirtualTwinSchema,
  type HcpInsights,
  type HcpTags,
  type TwinIdentity,
  type VirtualTwin,
} from "@hca/domain";
import { pinyin } from "pinyin-pro";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { asJson, getPool } from "./client.js";

/** open_chat 通用工作区占位 hcp_id（满足 FK；非真实医生，不进数字分身列表） */
export const AGENT_GENERAL_HCP_ID = "_agent_general";

export type TwinListItem = {
  hcp_id: string;
  name_zh: string;
  hospital: string;
  department: string;
  as_of: string | null;
  twin_version: number;
  tags: HcpTags | null;
  /** Display summary only (同源字段摘要，供列表截断). */
  doing_now?: string;
};

function twinIdentity(twin: VirtualTwin): TwinIdentity {
  return (
    twin.identity ?? {
      name_zh: twin.profile.name_zh,
      name_en: twin.profile.name_en,
      hospital: twin.profile.hospital,
      department: twin.profile.department,
      city: twin.profile.city,
      title: twin.profile.title,
    }
  );
}

export async function upsertTwin(twin: VirtualTwin): Promise<VirtualTwin> {
  const parsed = VirtualTwinSchema.parse(twin);
  const identity = twinIdentity(parsed);
  const pool = getPool();
  await pool.query(
    `INSERT INTO hcp_twins (hcp_id, identity, twin, tags, as_of, twin_version, schema_version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW()) AS new
     ON DUPLICATE KEY UPDATE
       identity = new.identity,
       twin = new.twin,
       tags = new.tags,
       as_of = new.as_of,
       twin_version = new.twin_version,
       schema_version = new.schema_version,
       updated_at = NOW()`,
    [
      parsed.meta.hcp_id,
      JSON.stringify(identity),
      JSON.stringify(parsed),
      parsed.profile.tags ? JSON.stringify(parsed.profile.tags) : null,
      parsed.meta.as_of,
      parsed.meta.twin_version,
      parsed.meta.schema_version,
    ],
  );
  return parsed;
}

export async function getTwin(hcpId: string): Promise<VirtualTwin | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT twin FROM hcp_twins WHERE hcp_id = ?`,
    [hcpId],
  );
  const row = rows[0];
  if (!row) return null;
  return VirtualTwinSchema.parse(asJson<unknown>(row.twin));
}

export async function deleteTwin(hcpId: string): Promise<boolean> {
  if (hcpId === AGENT_GENERAL_HCP_ID) return false;
  const pool = getPool();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM hcp_twins WHERE hcp_id = ?`,
    [hcpId],
  );
  return (result.affectedRows ?? 0) > 0;
}

export async function listTwins(): Promise<TwinListItem[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.hcp_id, t.identity, t.tags, t.as_of, t.twin_version,
            COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(i.payload, '$.doing_now.summary')),
              CASE
                WHEN JSON_TYPE(JSON_EXTRACT(i.payload, '$.doing_now')) = 'STRING'
                THEN JSON_UNQUOTE(JSON_EXTRACT(i.payload, '$.doing_now'))
                ELSE NULL
              END
            ) AS doing_now
     FROM hcp_twins t
     LEFT JOIN hcp_insights i ON i.hcp_id = t.hcp_id
     WHERE t.hcp_id <> ?
     ORDER BY t.updated_at DESC`,
    [AGENT_GENERAL_HCP_ID],
  );
  return rows.map((row) => {
    const identity = asJson<TwinIdentity>(row.identity);
    return {
      hcp_id: String(row.hcp_id),
      name_zh: identity.name_zh,
      hospital: identity.hospital,
      department: identity.department,
      as_of: row.as_of ?? null,
      twin_version: Number(row.twin_version),
      tags: asJson<HcpTags | null>(row.tags),
      doing_now: row.doing_now ?? undefined,
    };
  });
}

export async function upsertInsights(insights: HcpInsights): Promise<HcpInsights> {
  const parsed = HcpInsightsSchema.parse(insights);
  const pool = getPool();
  await pool.query(
    `INSERT INTO hcp_insights (hcp_id, payload, as_of, updated_at)
     VALUES (?, ?, ?, NOW()) AS new
     ON DUPLICATE KEY UPDATE
       payload = new.payload,
       as_of = new.as_of,
       updated_at = NOW()`,
    [parsed.hcp_id, JSON.stringify(parsed), parsed.as_of],
  );
  return parsed;
}

export async function getInsights(hcpId: string): Promise<HcpInsights | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT payload FROM hcp_insights WHERE hcp_id = ?`,
    [hcpId],
  );
  const row = rows[0];
  if (!row) return null;
  return HcpInsightsSchema.parse(asJson<unknown>(row.payload));
}

export async function updateTwinIdentity(
  hcpId: string,
  patch: {
    name_zh?: string;
    hospital?: string;
    department?: string;
    city?: string;
    title?: string;
  },
): Promise<VirtualTwin | null> {
  const twin = await getTwin(hcpId);
  if (!twin) return null;
  const next: VirtualTwin = {
    ...twin,
    identity: {
      name_zh: patch.name_zh ?? twin.identity?.name_zh ?? twin.profile.name_zh,
      name_en: twin.identity?.name_en ?? twin.profile.name_en,
      hospital: patch.hospital ?? twin.identity?.hospital ?? twin.profile.hospital,
      department:
        patch.department ?? twin.identity?.department ?? twin.profile.department,
      city: patch.city ?? twin.identity?.city ?? twin.profile.city,
      title: patch.title ?? twin.identity?.title ?? twin.profile.title,
    },
    profile: {
      ...twin.profile,
      name_zh: patch.name_zh ?? twin.profile.name_zh,
      hospital: patch.hospital ?? twin.profile.hospital,
      department: patch.department ?? twin.profile.department,
      city: patch.city ?? twin.profile.city,
      title: patch.title ?? twin.profile.title,
    },
  };
  return upsertTwin(next);
}

export async function updateTwinTags(
  hcpId: string,
  tags: HcpTags,
): Promise<VirtualTwin | null> {
  const twin = await getTwin(hcpId);
  if (!twin) return null;
  const next: VirtualTwin = {
    ...twin,
    profile: { ...twin.profile, tags },
  };
  return upsertTwin(next);
}

function normalizeCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export { normalizeCompare };

function stripLatinPunctuation(value: string): string {
  return value.replace(/[-'\u2019]/g, "");
}

function normalizeLatinTarget(value: string): string {
  return normalizeCompare(stripLatinPunctuation(value));
}

const LEADING_TITLE = /^\s*(?:dr|prof|md)\.?\s+/i;

function stripLeadingTitles(value: string): string {
  let s = value.trim();
  for (;;) {
    const next = s.replace(LEADING_TITLE, "");
    if (next === s) return s;
    s = next.trim();
  }
}

/** 拉丁查询：行首称谓、逗号、连字符与撇号（见 mcp2-design §6） */
function normalizeLatinQuery(value: string): string {
  let s = stripLeadingTitles(value);
  s = s.replace(/[,，]/g, " ");
  s = stripLatinPunctuation(s);
  return s.trim();
}

function identityPinyinCompact(nameZh: string): string {
  return normalizeCompare(
    pinyin(nameZh, { toneType: "none", type: "array" }).join(""),
  );
}

function isLatinQuery(value: string): boolean {
  return /^[\p{Script=Latin}\s',\-'\u2019，]+$/u.test(value.trim());
}

/** 名在前：至少两段时倒序拼接后再与英文 / 拼音比 */
function reversedLatinCompact(preparedLatin: string): string | null {
  const parts = preparedLatin.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return normalizeCompare([...parts].reverse().join(" "));
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n]!;
}

/** 0 精确，1 词序互换精确，2 编辑距离 ≤1；不命中为 null */
export type NameMatchTier = 0 | 1 | 2;

export function nameMatchTier(
  name: string,
  identity: TwinIdentity,
): NameMatchTier | null {
  const needle = name.trim();
  if (!needle) return null;
  if (identity.name_zh === needle) return 0;

  const prepared = normalizeLatinQuery(needle);
  const normNeedle = normalizeCompare(prepared);
  const latinTargets: string[] = [];
  if (identity.name_en) latinTargets.push(normalizeLatinTarget(identity.name_en));
  const py = identityPinyinCompact(identity.name_zh);
  if (py) latinTargets.push(py);

  for (const target of latinTargets) {
    if (normNeedle === target) return 0;
  }

  const reversed = reversedLatinCompact(prepared);
  if (reversed) {
    for (const target of latinTargets) {
      if (reversed === target) return 1;
    }
  }

  if (isLatinQuery(needle)) {
    const candidates = [normNeedle];
    if (reversed) candidates.push(reversed);
    for (const compact of candidates) {
      if (compact.length < 6) continue;
      for (const target of latinTargets) {
        if (target.length >= 6 && editDistance(compact, target) <= 1) {
          return 2;
        }
      }
    }
  }

  return null;
}

/** 姓名匹配：中文精确；拉丁名见 nameMatchTier */
export function nameMatches(name: string, identity: TwinIdentity): boolean {
  return nameMatchTier(name, identity) !== null;
}

/** ADR-011：归一相等（档 0）或双向子串（档 1，短边达 minLen 才触发） */
function orgFieldMatches(
  identityValue: string,
  filterValue: string,
  minLen: number,
): boolean {
  const a = normalizeCompare(identityValue);
  const b = normalizeCompare(filterValue);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < minLen) return false;
  return a.includes(b) || b.includes(a);
}

/** 可选过滤：hospital/department 归一相等或包含匹配（ADR-011）；city 仅归一相等 */
export function filtersMatch(
  identity: TwinIdentity,
  filters: { hospital?: string; department?: string; city?: string },
): boolean {
  if (filters.hospital !== undefined && filters.hospital !== "") {
    if (!orgFieldMatches(identity.hospital, filters.hospital, 3)) {
      return false;
    }
  }
  if (filters.department !== undefined && filters.department !== "") {
    if (!orgFieldMatches(identity.department, filters.department, 2)) {
      return false;
    }
  }
  if (filters.city !== undefined && filters.city !== "") {
    const city = identity.city ?? "";
    if (normalizeCompare(city) !== normalizeCompare(filters.city)) {
      return false;
    }
  }
  return true;
}

export type QueryTwinsInput = {
  hcp_id?: string;
  name?: string;
  hospital?: string;
  department?: string;
  city?: string;
};

export type QueryTwinsResult =
  | { found: false }
  | { found: true; items: VirtualTwin[] };

/** 对外 MCP query_hcp 读库（排除 _agent_general） */
export async function queryTwins(input: QueryTwinsInput): Promise<QueryTwinsResult> {
  const filters = {
    hospital: input.hospital,
    department: input.department,
    city: input.city,
  };

  if (input.hcp_id) {
    if (input.hcp_id === AGENT_GENERAL_HCP_ID) return { found: false };
    const twin = await getTwin(input.hcp_id);
    if (!twin) return { found: false };
    const identity = twinIdentity(twin);
    if (!filtersMatch(identity, filters)) return { found: true, items: [] };
    return { found: true, items: [twin] };
  }

  const name = input.name?.trim();
  if (!name) return { found: true, items: [] };

  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT twin, identity FROM hcp_twins WHERE hcp_id <> ?`,
    [AGENT_GENERAL_HCP_ID],
  );
  const hits: { tier: 0 | 1 | 2; twin: VirtualTwin; order: number }[] = [];
  let order = 0;
  for (const row of rows) {
    const identity = asJson<TwinIdentity>(row.identity);
    const tier = nameMatchTier(name, identity);
    if (tier === null) continue;
    if (!filtersMatch(identity, filters)) continue;
    hits.push({
      tier,
      twin: VirtualTwinSchema.parse(asJson<unknown>(row.twin)),
      order: order++,
    });
  }
  hits.sort((a, b) => a.tier - b.tier || a.order - b.order);
  return { found: true, items: hits.map((h) => h.twin) };
}
