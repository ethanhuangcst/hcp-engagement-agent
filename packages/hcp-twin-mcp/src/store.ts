import type { HcpInsights, HcpTags, VirtualTwin } from "@hca/domain";
import {
  deleteTwin as dbDeleteTwin,
  getInsights as dbGetInsights,
  getTwin as dbGetTwin,
  pingDatabase,
  updateTwinTags as dbUpdateTwinTags,
  upsertInsights as dbUpsertInsights,
  upsertTwin as dbUpsertTwin,
} from "@hca/db";

export type TwinStore = {
  mode: "mock" | "live";
  ping(): Promise<boolean>;
  getTwin(hcpId: string): Promise<VirtualTwin | null>;
  upsertTwin(twin: VirtualTwin): Promise<VirtualTwin>;
  deleteTwin(hcpId: string): Promise<boolean>;
  getInsights(hcpId: string): Promise<HcpInsights | null>;
  upsertInsights(insights: HcpInsights): Promise<HcpInsights>;
  updateTags(hcpId: string, tags: HcpTags): Promise<VirtualTwin | null>;
  /** Test helper: clear memory store */
  clear?(): void;
};

export function createMemoryStore(): TwinStore {
  const twins = new Map<string, VirtualTwin>();
  const insights = new Map<string, HcpInsights>();

  return {
    mode: "mock",
    async ping() {
      return true;
    },
    async getTwin(hcpId) {
      return twins.get(hcpId) ?? null;
    },
    async upsertTwin(twin) {
      twins.set(twin.meta.hcp_id, twin);
      return twin;
    },
    async deleteTwin(hcpId) {
      const had = twins.delete(hcpId);
      insights.delete(hcpId);
      return had;
    },
    async getInsights(hcpId) {
      return insights.get(hcpId) ?? null;
    },
    async upsertInsights(row) {
      insights.set(row.hcp_id, row);
      return row;
    },
    async updateTags(hcpId, tags) {
      const twin = twins.get(hcpId);
      if (!twin) return null;
      const next: VirtualTwin = {
        ...twin,
        profile: { ...twin.profile, tags },
      };
      twins.set(hcpId, next);
      return next;
    },
    clear() {
      twins.clear();
      insights.clear();
    },
  };
}

export function createPostgresStore(mode: "mock" | "live" = "live"): TwinStore {
  return {
    mode,
    ping: () => pingDatabase(),
    getTwin: dbGetTwin,
    upsertTwin: dbUpsertTwin,
    deleteTwin: dbDeleteTwin,
    getInsights: dbGetInsights,
    upsertInsights: dbUpsertInsights,
    updateTags: dbUpdateTwinTags,
  };
}

/**
 * mock：resolve 等仍走 fixture（零外网）；落库与 BFF 共用 Postgres（有 DATABASE_URL 时）。
 * 无 DATABASE_URL 时退回内存（纯单测）。
 */
export function createStore(mode: "mock" | "live" = "live"): TwinStore {
  if (process.env.DATABASE_URL) {
    return createPostgresStore(mode);
  }
  // 无 DATABASE_URL 时内存库；mode 仍区分 live/mock 采集行为
  const mem = createMemoryStore();
  return { ...mem, mode };
}
