import type { HttpClient } from "./http.js";
import { searchCtGovByInvestigator, type TrialHit } from "./ctgov.js";

export type ActivityEvent = {
  event_id: string;
  date: string | null;
  name: string;
  location: string | null;
  url: string;
  bucket: "academic" | "policy_media";
  source_type: string;
  confidence: "high" | "medium" | "low";
};

function daysAgo(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / (24 * 3600 * 1000));
}

function emptyWindow(note: string) {
  return {
    event_ids: [] as string[],
    event_count: 0,
    no_public_evidence: true,
    note,
  };
}

/** Stage D：公开试验/旁证 → 时间窗；失败返回空窗标记，不阻断 Stage E. */
export async function collectHeatmapLive(
  http: HttpClient,
  input: { name_zh: string; name_en?: string | null },
): Promise<{
  events: ActivityEvent[];
  windows: Record<string, ReturnType<typeof emptyWindow>>;
  last_polled_at: string;
  trials: TrialHit[];
  no_public_evidence: boolean;
}> {
  const now = new Date();
  const last_polled_at = now.toISOString();
  let trials: TrialHit[] = [];
  try {
    const q = input.name_en?.trim() || input.name_zh;
    trials = await searchCtGovByInvestigator(http, q, 12);
  } catch {
    return {
      events: [],
      windows: {
        earlier: emptyWindow("CT.gov 暂不可用"),
        d90: emptyWindow("CT.gov 暂不可用"),
        d60: emptyWindow("CT.gov 暂不可用"),
        d30: emptyWindow("CT.gov 暂不可用"),
      },
      last_polled_at,
      trials: [],
      no_public_evidence: true,
    };
  }

  const events: ActivityEvent[] = trials.map((t) => ({
    event_id: t.nct_id,
    date: t.start_date ?? null,
    name: t.title,
    location: null,
    url: t.url,
    bucket: "academic" as const,
    source_type: t.source_type,
    confidence: t.confidence,
  }));

  const windows = {
    earlier: emptyWindow("无公开证据"),
    d90: emptyWindow("无公开证据"),
    d60: emptyWindow("无公开证据"),
    d30: emptyWindow("无公开证据"),
  };

  for (const e of events) {
    const age = daysAgo(e.date, now);
    let key: keyof typeof windows = "earlier";
    if (age !== null) {
      if (age <= 30) key = "d30";
      else if (age <= 60) key = "d60";
      else if (age <= 90) key = "d90";
      else key = "earlier";
    }
    const w = windows[key];
    w.event_ids.push(e.event_id);
    w.event_count = w.event_ids.length;
    w.no_public_evidence = false;
    w.note = "";
  }

  return {
    events,
    windows,
    last_polled_at,
    trials,
    no_public_evidence: events.length === 0,
  };
}
