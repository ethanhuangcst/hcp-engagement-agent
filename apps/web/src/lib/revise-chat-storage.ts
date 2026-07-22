/** 一人一策页底 revise_options 对话：浏览器本地持久化（无登录） */

export type ReviseChatMsg = { role: "user" | "assistant"; content: string };

export type ReviseChatThread = {
  hcpId: string;
  runId: string;
  optionId: string;
  sessionId: string | null;
  messages: ReviseChatMsg[];
  updatedAt: string;
};

const PREFIX = "hca-revise-chat:";
const MAX_THREADS = 80;

export function reviseChatStorageKey(
  hcpId: string,
  runId: string,
  optionId: string,
): string {
  return `${PREFIX}${hcpId}:${runId}:${optionId}`;
}

export function loadReviseChatThread(
  hcpId: string,
  runId: string,
  optionId: string,
): ReviseChatThread | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(
      reviseChatStorageKey(hcpId, runId, optionId),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviseChatThread;
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveReviseChatThread(thread: ReviseChatThread): void {
  if (typeof window === "undefined") return;
  try {
    const key = reviseChatStorageKey(
      thread.hcpId,
      thread.runId,
      thread.optionId,
    );
    localStorage.setItem(key, JSON.stringify(thread));
    pruneOldestThreads();
  } catch {
    /* quota / private mode：忽略 */
  }
}

function pruneOldestThreads(): void {
  const keys: { key: string; updatedAt: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const t = JSON.parse(raw) as { updatedAt?: string };
      keys.push({ key, updatedAt: t.updatedAt ?? "" });
    } catch {
      keys.push({ key, updatedAt: "" });
    }
  }
  if (keys.length <= MAX_THREADS) return;
  keys
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, keys.length - MAX_THREADS)
    .forEach(({ key }) => localStorage.removeItem(key));
}
