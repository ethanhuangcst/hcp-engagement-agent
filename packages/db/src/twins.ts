import {
  HcpInsightsSchema,
  VirtualTwinSchema,
  type HcpInsights,
  type HcpTags,
  type TwinIdentity,
  type VirtualTwin,
} from "@hca/domain";
import { getPool } from "./client.js";

/** open_chat 通用工作区占位 hcp_id（满足 FK；非真实医生，不进数字分身列表） */
export const AGENT_GENERAL_HCP_ID = "_agent_general";

export type TwinListItem = {
  hcp_id: string;
  name_zh: string;
  /** OpenAlex-style Given Family Latin name when known (e.g. Changxi Wang). */
  name_en?: string | null;
  hospital: string;
  department: string;
  as_of: string | null;
  twin_version: number;
  tags: HcpTags | null;
  /** Display summary only (同源字段摘要，供列表截断 / zh compat). */
  doing_now?: string;
  /** Per-locale one-line summaries for UI locale pick. */
  doing_now_by_locale?: { "zh-CN"?: string; en?: string };
};

export async function upsertTwin(twin: VirtualTwin): Promise<VirtualTwin> {
  const parsed = VirtualTwinSchema.parse(twin);
  const identity: TwinIdentity = parsed.identity ?? {
    name_zh: parsed.profile.name_zh,
    name_en: parsed.profile.name_en,
    hospital: parsed.profile.hospital,
    department: parsed.profile.department,
    city: parsed.profile.city,
    title: parsed.profile.title,
  };
  const pool = getPool();
  await pool.query(
    `INSERT INTO hcp_twins (hcp_id, identity, twin, tags, as_of, twin_version, schema_version, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::date, $6, $7, NOW())
     ON CONFLICT (hcp_id) DO UPDATE SET
       identity = EXCLUDED.identity,
       twin = EXCLUDED.twin,
       tags = EXCLUDED.tags,
       as_of = EXCLUDED.as_of,
       twin_version = EXCLUDED.twin_version,
       schema_version = EXCLUDED.schema_version,
       updated_at = NOW()`,
    [
      parsed.meta.hcp_id,
      JSON.stringify(identity),
      JSON.stringify(parsed),
      JSON.stringify(parsed.profile.tags ?? null),
      parsed.meta.as_of,
      parsed.meta.twin_version,
      parsed.meta.schema_version,
    ],
  );
  return parsed;
}

export async function getTwin(hcpId: string): Promise<VirtualTwin | null> {
  const pool = getPool();
  const r = await pool.query<{ twin: unknown }>(
    `SELECT twin FROM hcp_twins WHERE hcp_id = $1`,
    [hcpId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return VirtualTwinSchema.parse(row.twin);
}

export async function deleteTwin(hcpId: string): Promise<boolean> {
  if (hcpId === AGENT_GENERAL_HCP_ID) return false;
  const pool = getPool();
  const r = await pool.query(`DELETE FROM hcp_twins WHERE hcp_id = $1`, [hcpId]);
  return (r.rowCount ?? 0) > 0;
}

export async function listTwins(): Promise<TwinListItem[]> {
  const pool = getPool();
  const r = await pool.query<{
    hcp_id: string;
    identity: TwinIdentity;
    tags: HcpTags | null;
    as_of: string | null;
    twin_version: number;
    doing_now: string | null;
    locales: unknown;
    top_locale: string | null;
  }>(
    `SELECT t.hcp_id, t.identity, t.tags, t.as_of::text, t.twin_version,
            COALESCE(
              i.payload->'doing_now'->>'summary',
              CASE
                WHEN jsonb_typeof(i.payload->'doing_now') = 'string'
                THEN i.payload->>'doing_now'
                ELSE NULL
              END
            ) AS doing_now,
            i.payload->'locales' AS locales,
            i.payload->'doing_now'->>'locale' AS top_locale
     FROM hcp_twins t
     LEFT JOIN hcp_insights i ON i.hcp_id = t.hcp_id
     WHERE t.hcp_id <> $1
     ORDER BY t.updated_at DESC`,
    [AGENT_GENERAL_HCP_ID],
  );
  return r.rows.map((row) => {
    const locales = row.locales as
      | {
          "zh-CN"?: { doing_now?: { summary?: string } };
          en?: { doing_now?: { summary?: string } };
        }
      | null;
    const zh =
      locales?.["zh-CN"]?.doing_now?.summary?.trim() ||
      (row.top_locale !== "en" ? row.doing_now : null) ||
      undefined;
    const en =
      locales?.en?.doing_now?.summary?.trim() ||
      (row.top_locale === "en" ? row.doing_now : null) ||
      undefined;
    return {
      hcp_id: row.hcp_id,
      name_zh: row.identity.name_zh,
      name_en: row.identity.name_en ?? null,
      hospital: row.identity.hospital,
      department: row.identity.department,
      as_of: row.as_of,
      twin_version: row.twin_version,
      tags: row.tags,
      doing_now: zh ?? row.doing_now ?? undefined,
      doing_now_by_locale: {
        ...(zh ? { "zh-CN": zh } : {}),
        ...(en ? { en } : {}),
      },
    };
  });
}

export async function upsertInsights(insights: HcpInsights): Promise<HcpInsights> {
  const parsed = HcpInsightsSchema.parse(insights);
  const pool = getPool();
  await pool.query(
    `INSERT INTO hcp_insights (hcp_id, payload, as_of, updated_at)
     VALUES ($1, $2::jsonb, $3::date, NOW())
     ON CONFLICT (hcp_id) DO UPDATE SET
       payload = EXCLUDED.payload,
       as_of = EXCLUDED.as_of,
       updated_at = NOW()`,
    [parsed.hcp_id, JSON.stringify(parsed), parsed.as_of],
  );
  return parsed;
}

export async function getInsights(hcpId: string): Promise<HcpInsights | null> {
  const pool = getPool();
  const r = await pool.query<{ payload: unknown }>(
    `SELECT payload FROM hcp_insights WHERE hcp_id = $1`,
    [hcpId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return HcpInsightsSchema.parse(row.payload);
}

export async function updateTwinIdentity(
  hcpId: string,
  patch: {
    name_zh?: string;
    name_en?: string | null;
    hospital?: string;
    department?: string;
    city?: string;
    title?: string;
  },
): Promise<VirtualTwin | null> {
  const twin = await getTwin(hcpId);
  if (!twin) return null;
  const nextNameEn =
    patch.name_en !== undefined
      ? patch.name_en?.trim() || undefined
      : (twin.identity?.name_en ?? twin.profile.name_en);
  const next: VirtualTwin = {
    ...twin,
    identity: {
      name_zh: patch.name_zh ?? twin.identity?.name_zh ?? twin.profile.name_zh,
      name_en: nextNameEn,
      hospital: patch.hospital ?? twin.identity?.hospital ?? twin.profile.hospital,
      department:
        patch.department ?? twin.identity?.department ?? twin.profile.department,
      city: patch.city ?? twin.identity?.city ?? twin.profile.city,
      title: patch.title ?? twin.identity?.title ?? twin.profile.title,
    },
    profile: {
      ...twin.profile,
      name_zh: patch.name_zh ?? twin.profile.name_zh,
      name_en: nextNameEn,
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
