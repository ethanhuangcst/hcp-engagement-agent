/** Live HTTP helper：超时、限速、可注入 fetch（单测用，非 Twin mock）。 */

export type FetchFn = typeof fetch;

const DEFAULT_TIMEOUT_MS = 20_000;

export type HttpClient = {
  getJson<T>(url: string, init?: RequestInit): Promise<T>;
  getText(url: string, init?: RequestInit): Promise<string>;
};

export function createHttpClient(opts?: {
  fetchFn?: FetchFn;
  timeoutMs?: number;
  mailto?: string;
  minIntervalMs?: number;
}): HttpClient {
  const fetchFn = opts?.fetchFn ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const mailto = opts?.mailto ?? process.env.OPENALEX_MAILTO ?? "hca@localhost";
  const minIntervalMs = opts?.minIntervalMs ?? 120;
  let lastAt = 0;

  async function throttle() {
    const now = Date.now();
    const wait = lastAt + minIntervalMs - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
  }

  async function request(url: string, init?: RequestInit): Promise<Response> {
    await throttle();
    const u = new URL(url);
    if (u.hostname.includes("openalex.org") && !u.searchParams.has("mailto")) {
      u.searchParams.set("mailto", mailto);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchFn(u.toString(), {
        ...init,
        signal: ctrl.signal,
        headers: {
          Accept: "application/json, text/html;q=0.9,*/*;q=0.8",
          "User-Agent": `hcp-twin-mcp/0.1 (mailto:${mailto})`,
          ...(init?.headers ?? {}),
        },
      });
      if (res.status === 429) {
        const err = new Error(`RATE_LIMITED ${u.hostname}`);
        (err as Error & { code: string }).code = "RATE_LIMITED";
        throw err;
      }
      if (!res.ok) {
        const err = new Error(`SOURCE_UNAVAILABLE ${u.hostname} ${res.status}`);
        (err as Error & { code: string }).code = "SOURCE_UNAVAILABLE";
        throw err;
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getJson<T>(url: string, init?: RequestInit): Promise<T> {
      const res = await request(url, init);
      return (await res.json()) as T;
    },
    async getText(url: string, init?: RequestInit): Promise<string> {
      const res = await request(url, init);
      return res.text();
    },
  };
}
