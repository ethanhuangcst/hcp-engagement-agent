/** HCP Engagement Agent open_chat：浏览器本地持久化（通用会话，不按 HCP 绑定） */

export type AgentChatMsg = {
  role: "user" | "assistant";
  content: string;
  attachments?: { name: string }[];
};

export type AgentSessionIndexItem = {
  sessionId: string;
  title: string;
  updatedAt: string;
};

export type AgentChatSession = {
  sessionId: string;
  title: string;
  messages: AgentChatMsg[];
  updatedAt: string;
};

const INDEX_KEY = "hca-agent-chat-index-v2";
const SESSION_PREFIX = "hca-agent-chat:";
const COOKIE_LEGACY = "hca-agent-session-index";
const INDEX_LEGACY = "hca-agent-chat-index";
const MAX_SESSIONS = 40;

export const DEFAULT_AGENT_GREETING: AgentChatMsg = {
  role: "assistant",
  content:
    "我是 HCP Engagement Agent（通用开放对话）。可讨论疾病领域找人、渠道策略、合规边界与访前准备；不默认绑定某一位医生数字分身。一人一策修订请用工作台「一人一策」页底。正式外发仍须 MLR。",
};

function sessionKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

export function loadAgentIndex(): AgentSessionIndexItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) {
      const list = JSON.parse(raw) as AgentSessionIndexItem[];
      if (Array.isArray(list)) return list;
    }
  } catch {
    /* ignore */
  }
  return migrateLegacyIndex();
}

function migrateLegacyIndex(): AgentSessionIndexItem[] {
  const now = new Date().toISOString();
  const fromLs = readLegacyLocalIndex(now);
  if (fromLs.length) {
    saveAgentIndex(fromLs);
    return fromLs;
  }
  return migrateCookieIndex(now);
}

function readLegacyLocalIndex(now: string): AgentSessionIndexItem[] {
  try {
    const raw = localStorage.getItem(INDEX_LEGACY);
    if (!raw) return [];
    const legacy = JSON.parse(raw) as {
      sessionId: string;
      title: string;
      updatedAt?: string;
    }[];
    if (!Array.isArray(legacy)) return [];
    return legacy.map((s) => ({
      sessionId: s.sessionId,
      title: s.title,
      updatedAt: s.updatedAt ?? now,
    }));
  } catch {
    return [];
  }
}

function migrateCookieIndex(now: string): AgentSessionIndexItem[] {
  if (typeof document === "undefined") return [];
  const raw = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${COOKIE_LEGACY}=`))
    ?.split("=")[1];
  if (!raw) return [];
  try {
    const legacy = JSON.parse(decodeURIComponent(raw)) as {
      sessionId: string;
      title: string;
    }[];
    if (!Array.isArray(legacy)) return [];
    const migrated: AgentSessionIndexItem[] = legacy.map((s) => ({
      sessionId: s.sessionId,
      title: s.title,
      updatedAt: now,
    }));
    saveAgentIndex(migrated);
    return migrated;
  } catch {
    return [];
  }
}

export function saveAgentIndex(list: AgentSessionIndexItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      INDEX_KEY,
      JSON.stringify(list.slice(0, MAX_SESSIONS)),
    );
  } catch {
    /* quota */
  }
}

export function loadAgentSession(sessionId: string): AgentChatSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(sessionKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentChatSession & { hcpId?: string };
    if (!Array.isArray(parsed.messages)) return null;
    return {
      sessionId: parsed.sessionId,
      title: parsed.title,
      messages: parsed.messages,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function saveAgentSession(session: AgentChatSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(sessionKey(session.sessionId), JSON.stringify(session));
    const index = loadAgentIndex().filter(
      (s) => s.sessionId !== session.sessionId,
    );
    const next: AgentSessionIndexItem[] = [
      {
        sessionId: session.sessionId,
        title: session.title,
        updatedAt: session.updatedAt,
      },
      ...index,
    ].slice(0, MAX_SESSIONS);
    saveAgentIndex(next);
    pruneOrphanSessions(next.map((s) => s.sessionId));
  } catch {
    /* quota */
  }
}

function pruneOrphanSessions(keepIds: string[]): void {
  const keep = new Set(keepIds);
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(SESSION_PREFIX)) continue;
    const id = key.slice(SESSION_PREFIX.length);
    if (!keep.has(id)) toRemove.push(key);
  }
  for (const key of toRemove) localStorage.removeItem(key);
}

export function upsertAgentSessionMessages(input: {
  sessionId: string;
  title: string;
  messages: AgentChatMsg[];
}): AgentChatSession {
  const session: AgentChatSession = {
    sessionId: input.sessionId,
    title: input.title,
    messages: input.messages,
    updatedAt: new Date().toISOString(),
  };
  saveAgentSession(session);
  return session;
}
