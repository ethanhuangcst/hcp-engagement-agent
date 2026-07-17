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

export function createPostgresStore(): TwinStore {
  return {
    mode: "live",
    ping: () => pingDatabase(),
    getTwin: dbGetTwin,
    upsertTwin: dbUpsertTwin,
    deleteTwin: dbDeleteTwin,
    getInsights: dbGetInsights,
    upsertInsights: dbUpsertInsights,
    updateTags: dbUpdateTwinTags,
  };
}

export function createStore(mode: "mock" | "live" = "mock"): TwinStore {
  return mode === "live" ? createPostgresStore() : createMemoryStore();
}
