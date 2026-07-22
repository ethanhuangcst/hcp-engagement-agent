import {
  ChatSessionSchema,
  EngagementOptionsRunSchema,
  type ChatSession,
  type EngagementOptionsRun,
} from "@hca/domain";
import { getPool } from "./client.js";

export async function upsertEngagementOptions(
  run: EngagementOptionsRun,
): Promise<EngagementOptionsRun> {
  const parsed = EngagementOptionsRunSchema.parse(run);
  const pool = getPool();
  await pool.query(
    `INSERT INTO engagement_options (run_id, hcp_id, payload, as_of, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::date, NOW())
     ON CONFLICT (run_id) DO UPDATE SET
       hcp_id = EXCLUDED.hcp_id,
       payload = EXCLUDED.payload,
       as_of = EXCLUDED.as_of,
       updated_at = NOW()`,
    [
      parsed.run_id,
      parsed.hcp_id,
      JSON.stringify(parsed),
      parsed.as_of,
    ],
  );
  return parsed;
}

export async function getEngagementOptionsRun(
  runId: string,
): Promise<EngagementOptionsRun | null> {
  const pool = getPool();
  const r = await pool.query<{ payload: unknown }>(
    `SELECT payload FROM engagement_options WHERE run_id = $1`,
    [runId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return EngagementOptionsRunSchema.parse(row.payload);
}

export async function getLatestEngagementOptions(
  hcpId: string,
  locale?: "zh-CN" | "en",
): Promise<EngagementOptionsRun | null> {
  const pool = getPool();
  // Fetch recent runs and pick first matching locale (legacy rows = zh-CN).
  const r = await pool.query<{ payload: unknown }>(
    `SELECT payload FROM engagement_options
     WHERE hcp_id = $1
     ORDER BY updated_at DESC
     LIMIT 20`,
    [hcpId],
  );
  if (r.rows.length === 0) return null;
  const want = locale ?? "zh-CN";
  for (const row of r.rows) {
    const run = EngagementOptionsRunSchema.parse(row.payload);
    const runLocale = run.locale ?? "zh-CN";
    if (runLocale === want) return run;
  }
  // No matching locale: do not return the other language (avoid bleed).
  if (locale) return null;
  const first = r.rows[0];
  if (!first) return null;
  return EngagementOptionsRunSchema.parse(first.payload);
}

export async function upsertChatSession(
  session: ChatSession,
): Promise<ChatSession> {
  const parsed = ChatSessionSchema.parse(session);
  const pool = getPool();
  await pool.query(
    `INSERT INTO chat_sessions (session_id, hcp_id, mode, option_run_id, payload, as_of, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::date, NOW())
     ON CONFLICT (session_id) DO UPDATE SET
       hcp_id = EXCLUDED.hcp_id,
       mode = EXCLUDED.mode,
       option_run_id = EXCLUDED.option_run_id,
       payload = EXCLUDED.payload,
       as_of = EXCLUDED.as_of,
       updated_at = NOW()`,
    [
      parsed.session_id,
      parsed.hcp_id,
      parsed.mode,
      parsed.option_run_id ?? null,
      JSON.stringify(parsed),
      parsed.as_of,
    ],
  );
  return parsed;
}

export async function getChatSession(
  sessionId: string,
): Promise<ChatSession | null> {
  const pool = getPool();
  const r = await pool.query<{ payload: unknown }>(
    `SELECT payload FROM chat_sessions WHERE session_id = $1`,
    [sessionId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return ChatSessionSchema.parse(row.payload);
}

export async function listChatSessions(
  hcpId: string,
  mode?: "open_chat" | "revise_options",
): Promise<ChatSession[]> {
  const pool = getPool();
  const r = mode
    ? await pool.query<{ payload: unknown }>(
        `SELECT payload FROM chat_sessions
         WHERE hcp_id = $1 AND mode = $2
         ORDER BY updated_at DESC
         LIMIT 50`,
        [hcpId, mode],
      )
    : await pool.query<{ payload: unknown }>(
        `SELECT payload FROM chat_sessions
         WHERE hcp_id = $1
         ORDER BY updated_at DESC
         LIMIT 50`,
        [hcpId],
      );
  return r.rows.map((row) => ChatSessionSchema.parse(row.payload));
}
