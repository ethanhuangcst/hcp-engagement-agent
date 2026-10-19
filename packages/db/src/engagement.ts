import {
  ChatSessionSchema,
  EngagementOptionsRunSchema,
  type ChatSession,
  type EngagementOptionsRun,
} from "@hca/domain";
import type { RowDataPacket } from "mysql2/promise";
import { asJson, getPool } from "./client.js";

export async function upsertEngagementOptions(
  run: EngagementOptionsRun,
): Promise<EngagementOptionsRun> {
  const parsed = EngagementOptionsRunSchema.parse(run);
  const pool = getPool();
  await pool.query(
    `INSERT INTO engagement_options (run_id, hcp_id, payload, as_of, updated_at)
     VALUES (?, ?, ?, ?, NOW()) AS new
     ON DUPLICATE KEY UPDATE
       hcp_id = new.hcp_id,
       payload = new.payload,
       as_of = new.as_of,
       updated_at = NOW()`,
    [parsed.run_id, parsed.hcp_id, JSON.stringify(parsed), parsed.as_of],
  );
  return parsed;
}

export async function getEngagementOptionsRun(
  runId: string,
): Promise<EngagementOptionsRun | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT payload FROM engagement_options WHERE run_id = ?`,
    [runId],
  );
  const row = rows[0];
  if (!row) return null;
  return EngagementOptionsRunSchema.parse(asJson<unknown>(row.payload));
}

export async function getLatestEngagementOptions(
  hcpId: string,
): Promise<EngagementOptionsRun | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT payload FROM engagement_options
     WHERE hcp_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    [hcpId],
  );
  const row = rows[0];
  if (!row) return null;
  return EngagementOptionsRunSchema.parse(asJson<unknown>(row.payload));
}

export async function upsertChatSession(
  session: ChatSession,
): Promise<ChatSession> {
  const parsed = ChatSessionSchema.parse(session);
  const pool = getPool();
  await pool.query(
    `INSERT INTO chat_sessions (session_id, hcp_id, mode, option_run_id, payload, as_of, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW()) AS new
     ON DUPLICATE KEY UPDATE
       hcp_id = new.hcp_id,
       mode = new.mode,
       option_run_id = new.option_run_id,
       payload = new.payload,
       as_of = new.as_of,
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
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT payload FROM chat_sessions WHERE session_id = ?`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return null;
  return ChatSessionSchema.parse(asJson<unknown>(row.payload));
}

export async function listChatSessions(
  hcpId: string,
  mode?: "open_chat" | "revise_options",
): Promise<ChatSession[]> {
  const pool = getPool();
  const [rows] = mode
    ? await pool.query<RowDataPacket[]>(
        `SELECT payload FROM chat_sessions
         WHERE hcp_id = ? AND mode = ?
         ORDER BY updated_at DESC
         LIMIT 50`,
        [hcpId, mode],
      )
    : await pool.query<RowDataPacket[]>(
        `SELECT payload FROM chat_sessions
         WHERE hcp_id = ?
         ORDER BY updated_at DESC
         LIMIT 50`,
        [hcpId],
      );
  return rows.map((row) => ChatSessionSchema.parse(asJson<unknown>(row.payload)));
}
