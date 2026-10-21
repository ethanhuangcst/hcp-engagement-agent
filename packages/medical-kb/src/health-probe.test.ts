import { beforeEach, describe, expect, it, vi } from "vitest";

const scrollSearch = vi.fn();

vi.mock("./qdrant.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./qdrant.js")>();
  return {
    ...actual,
    getQdrantClient: () => ({
      search: scrollSearch,
    }),
    pingQdrant: async () => true,
    listCollectionNames: async () => ["academic_index", "compliance_index"],
  };
});

vi.mock("./embedding.js", () => ({
  embedQuery: async () => [0.1, 0.2, 0.3],
  embedTexts: async () => [[0.1, 0.2, 0.3]],
  embeddingDim: (v: number[]) => v.length,
  rerank: async () => [1],
}));

vi.mock("./config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config.js")>();
  return {
    ...actual,
    getQdrantUrl: () => "http://127.0.0.1:6333",
  };
});

import { health } from "./api.js";

beforeEach(() => {
  scrollSearch.mockReset();
});

describe("health 探测读（F-RAG-023 / DEF-004）", () => {
  it("should_report_ok_when_both_probe_reads_succeed", async () => {
    scrollSearch.mockResolvedValue({ points: [{ id: "p1" }] });
    const h = await health();
    expect(h.ok).toBe(true);
    expect(h.probe?.academic.ok).toBe(true);
    expect(h.probe?.compliance.ok).toBe(true);
  });

  it("should_report_ok_false_when_academic_probe_read_panics", async () => {
    scrollSearch.mockImplementation((_collection: string, body: unknown) => {
      const filter = (body as { filter?: { must?: Array<{ match?: { value?: string } }> } })
        .filter;
      const value = filter?.must?.[0]?.match?.value;
      if (value === "academic") {
        throw Object.assign(new Error("OffsetOutOfBounds"), { status: 500 });
      }
      return Promise.resolve({ points: [] });
    });
    const h = await health();
    expect(h.ok).toBe(false);
    expect(h.probe?.academic.ok).toBe(false);
    expect(String(h.probe?.academic.error)).toContain("OffsetOutOfBounds");
    expect(h.probe?.compliance.ok).toBe(true);
  });

  it("should_probe_both_collections_with_index_filter", async () => {
    scrollSearch.mockResolvedValue({ points: [] });
    await health();
    const bodies = scrollSearch.mock.calls.map(
      (c: unknown[]) => c[1] as { filter: { must: Array<{ match: { value: string } }> } },
    );
    expect(bodies.map((b) => b.filter.must[0]!.match.value).sort()).toEqual([
      "academic",
      "compliance",
    ]);
    for (const b of bodies) {
      expect(b.filter.must.length).toBe(1);
    }
  });
});
