import { ragError, type RagError } from "./types.js";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertSafeQdrantUrl(url: string): { ok: true } | { ok: false; error: RagError } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      error: ragError("UNSAFE_QDRANT_BIND", `非法 QDRANT_URL: ${url}`, {
        repair_hint: "使用 http://127.0.0.1:6333",
      }),
    };
  }

  const host = parsed.hostname.toLowerCase();
  const allowNonLocal = process.env.QDRANT_ALLOW_NON_LOCAL === "true";
  const isLocal =
    LOOPBACK.has(host) ||
    host.endsWith(".internal") ||
    host === "qdrant" ||
    host.startsWith("172.");

  if (!isLocal && !allowNonLocal) {
    return {
      ok: false,
      error: ragError(
        "UNSAFE_QDRANT_BIND",
        `Qdrant 绑定不安全: ${host}（须 loopback/internal，或设 QDRANT_ALLOW_NON_LOCAL=true）`,
        {
          repair_hint: "改回 http://127.0.0.1:6333，或显式允许非本机",
        },
      ),
    };
  }

  return { ok: true };
}

export function isBindSafe(url: string): boolean {
  return assertSafeQdrantUrl(url).ok;
}
