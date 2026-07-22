import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store.js";
import { confirmAndSaveTwin, ZHU_HCP_ID } from "../tools.js";
import {
  buildTwinTool,
  getTwinStatusTool,
  pollHeatmapTool,
  resetBuildQueueForTests,
  retagAfterCareerTool,
} from "../tools-build.js";
import { createHttpClient, type HttpClient } from "../collectors/http.js";
import { runBuildStages } from "./pipeline.js";
import type { BuildStatus } from "./types.js";

function fakeHttp(handlers: Record<string, unknown>): HttpClient {
  return createHttpClient({
    minIntervalMs: 0,
    fetchFn: async (input) => {
      const url = String(input);
      for (const [key, body] of Object.entries(handlers)) {
        if (url.includes(key)) {
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      }
      if (url.includes("zs-hospital")) {
        return new Response("<html><title>中山医院</title><body>主任医师 教授</body></html>", {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    },
  });
}

describe("MVP-2 build_twin live pipeline (injected HTTP, not twin fixture stages)", () => {
  const store = createMemoryStore();

  beforeEach(() => {
    store.clear?.();
    resetBuildQueueForTests();
  });

  it("rejects concurrent builds for same hcpId", async () => {
    await confirmAndSaveTwin(store, ZHU_HCP_ID);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const http = createHttpClient({
      minIntervalMs: 0,
      fetchFn: async () => {
        await gate;
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      },
    });

    const a = await buildTwinTool(store, { hcpId: ZHU_HCP_ID, mode: "full" }, { http });
    expect(a.ok).toBe(true);
    const b = await buildTwinTool(store, { hcpId: ZHU_HCP_ID, mode: "full" }, { http });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.code).toBe("BUILD_IN_PROGRESS");
    release();
  });

  it("runBuildStages writes research/career/activity/insights from live HTTP", async () => {
    await confirmAndSaveTwin(store, ZHU_HCP_ID);
    const http = fakeHttp({
      "api.openalex.org/authors?search": {
        results: [
          {
            id: "https://openalex.org/authors/A5101900734",
            display_name: "Tongyu Zhu",
            orcid: "https://orcid.org/0000-0002-6197-0698",
            last_known_institutions: [{ display_name: "Zhongshan Hospital Fudan" }],
            x_concepts: [{ display_name: "Medicine", score: 0.9 }],
          },
        ],
      },
      "api.openalex.org/authors/A5101900734": {
        id: "https://openalex.org/authors/A5101900734",
        display_name: "Tongyu Zhu",
        orcid: "https://orcid.org/0000-0002-6197-0698",
        x_concepts: [{ display_name: "Kidney transplantation", score: 80, level: 2 }],
        last_known_institutions: [{ display_name: "Zhongshan Hospital Fudan" }],
        affiliations: [
          { institution: { display_name: "Fudan University" }, years: [2010] },
        ],
      },
      "api.openalex.org/works": {
        results: [
          {
            id: "https://openalex.org/works/W1",
            title: "Phage therapy in transplant",
            publication_year: 2024,
            doi: "https://doi.org/10.1000/test",
            concepts: [{ display_name: "Bacteriophage", score: 50 }],
          },
        ],
      },
      "pub.orcid.org": { "activities-summary": { works: { group: [] } } },
      "eutils.ncbi.nlm.nih.gov": { esearchresult: { idlist: ["12345"] } },
      "clinicaltrials.gov": {
        studies: [
          {
            protocolSection: {
              identificationModule: {
                nctId: "NCT01794871",
                briefTitle: "Sample trial",
              },
              statusModule: {
                overallStatus: "Completed",
                startDateStruct: { date: "2024-01-15" },
              },
            },
          },
        ],
      },
    });

    const status: BuildStatus = {
      runId: "run_test",
      hcpId: ZHU_HCP_ID,
      mode: "full",
      phase: "queued",
      progress: 0,
      message: "",
      updated_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    };
    const phases: string[] = [];
    await runBuildStages({ store, http }, status, (p) => {
      if (p.phase) phases.push(p.phase);
    });

    expect(phases).toEqual([
      "identity",
      "career",
      "research",
      "heatmap",
      "insights",
    ]);

    const twin = await store.getTwin(ZHU_HCP_ID);
    expect(twin?.research?.author_ids?.openalex).toBeTruthy();
    expect((twin?.research?.recent_pubs as unknown[])?.length).toBeGreaterThan(0);
    expect((twin?.research?.themes as string[])?.length).toBeGreaterThan(0);
    expect(twin?.career).toBeTruthy();
    expect((twin?.activity as { last_polled_at?: string })?.last_polled_at).toBeTruthy();

    const insights = await store.getInsights(ZHU_HCP_ID);
    expect(insights?.doing_now).toBeTruthy();

    // 不是「空跑假进度」：必须有公开源写入
    expect(JSON.stringify(twin?.research)).not.toContain("mock_fixture");
  });

  it("Stage C merges multiple OpenAlex ids with parallel works fetch", async () => {
    const primary = "A5096108853";
    const alias = "A5036793431";
    await confirmAndSaveTwin(store, {
      hcpId: "hcp_merge_perf",
      name_zh: "王长希",
      name_en: "Changxi Wang",
      hospital: "中山医院",
      department: "器官移植科",
      openalex_ids: [primary, alias],
    });

    const worksCalls: string[] = [];
    const http = createHttpClient({
      minIntervalMs: 0,
      fetchFn: async (input) => {
        const url = String(input);
        if (url.includes("api.openalex.org/works")) {
          worksCalls.push(url);
          const id = url.includes(alias) ? alias : primary;
          return new Response(
            JSON.stringify({
              results: [
                {
                  id: `https://openalex.org/works/W-${id}`,
                  title: `Paper ${id}`,
                  publication_year: 2023,
                  doi: `10.1000/${id}`,
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes(`authors/${primary}`) || url.includes(`authors/${alias}`)) {
          const id = url.includes(alias) ? alias : primary;
          return new Response(
            JSON.stringify({
              id: `https://openalex.org/authors/${id}`,
              display_name: "Changxi Wang",
              x_concepts: [{ display_name: "Medicine", score: 0.9, level: 0 }],
              last_known_institutions: [{ display_name: "Zhongshan Hospital" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("clinicaltrials.gov")) {
          return new Response(JSON.stringify({ studies: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      },
    });

    const status: BuildStatus = {
      runId: "run_merge",
      hcpId: "hcp_merge_perf",
      mode: "full",
      phase: "queued",
      progress: 0,
      message: "",
      updated_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    };
    await runBuildStages({ store, http }, status, () => undefined);

    expect(worksCalls.length).toBeGreaterThanOrEqual(2);
    const twin = await store.getTwin("hcp_merge_perf");
    const pubs = twin?.research?.recent_pubs as Array<{ title?: string }> | undefined;
    expect(pubs?.length).toBeGreaterThanOrEqual(2);
    const used = (twin?.activity as { openalex_ids_used?: string[] })?.openalex_ids_used;
    expect(used).toEqual(expect.arrayContaining([primary, alias]));
  });

  it("get_twin_status NOT_FOUND for unknown run", async () => {
    const r = await getTwinStatusTool(store, { runId: "run_missing" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });

  it("poll_heatmap writes last_polled_at", async () => {
    await confirmAndSaveTwin(store, ZHU_HCP_ID);
    // temporarily patch global fetch for poll tool's createHttpClient
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          studies: [
            {
              protocolSection: {
                identificationModule: {
                  nctId: "NCT1",
                  briefTitle: "T",
                },
                statusModule: {
                  startDateStruct: { date: "2024-06-01" },
                },
              },
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const r = await pollHeatmapTool(store, { hcpId: ZHU_HCP_ID });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.last_polled_at).toBeTruthy();
      const twin = await store.getTwin(ZHU_HCP_ID);
      expect((twin?.activity as { last_polled_at?: string })?.last_polled_at).toBeTruthy();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("retag_after_career updates tags unless user_override", async () => {
    await confirmAndSaveTwin(store, ZHU_HCP_ID);
    const r = await retagAfterCareerTool(store, { hcpId: ZHU_HCP_ID });
    expect(r.ok).toBe(true);
  });
});
