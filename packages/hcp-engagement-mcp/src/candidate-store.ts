import { randomUUID } from "node:crypto";

/**
 * ADR-010 候选令牌缓存：进程内 TTL（默认 30 分钟）+ 容量上限（超出逐出最早签发）。
 * 重启丢失属预期：调用方重新 query_hcp 即可重建；多实例 Redis 后置。
 */
export type CandidatePayload = {
  /** 派生主键：候选 hcpId 优先，缺省按 openalex ID 派生 */
  hcp_id: string;
  name_zh: string;
  name_en?: string | null;
  hospital: string;
  department: string;
  title?: string | null;
  city?: string;
  /** 候选携带的文献号（ADR-004，落 confirmAndSaveTwin 前不必再清洗） */
  author_ids?: Record<string, string | null | undefined>;
  /** 对内 resolve 返回的原始 candidate_id，审计用 */
  source_candidate_id?: string;
};

export type CandidateStoreOptions = {
  ttlMs?: number;
  capacity?: number;
  now?: () => number;
};

type Entry = { payload: CandidatePayload; issuedAt: number };

export const DEFAULT_TOKEN_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_TOKEN_CAPACITY = 1000;

export class CandidateStore {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly capacity: number;
  private readonly now: () => number;

  constructor(options?: CandidateStoreOptions) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TOKEN_TTL_MS;
    this.capacity = options?.capacity ?? DEFAULT_TOKEN_CAPACITY;
    this.now = options?.now ?? Date.now;
  }

  issue(payload: CandidatePayload): string {
    while (this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    const token = `cand_${randomUUID()}`;
    this.entries.set(token, { payload, issuedAt: this.now() });
    return token;
  }

  get(token: string): CandidatePayload | null {
    const entry = this.entries.get(token);
    if (!entry) return null;
    if (this.now() - entry.issuedAt >= this.ttlMs) {
      this.entries.delete(token);
      return null;
    }
    return entry.payload;
  }

  invalidate(token: string): void {
    this.entries.delete(token);
  }
}