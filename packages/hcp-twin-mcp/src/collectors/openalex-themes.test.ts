import { describe, expect, it } from "vitest";
import {
  fetchOpenAlexWorkConcepts,
  openAlexDisplayMatchesHcp,
  themesFromOpenAlex,
} from "./openalex.js";
import type { HttpClient } from "./http.js";

/** feature-12 跟进（B+ 设计）：论文级概念聚合的单测桩，不外网 */
function stubHttp(pages: Record<string, unknown>): HttpClient {
  return {
    async getJson<T>(url: string): Promise<T> {
      const key = Object.keys(pages).find((k) => url.includes(k));
      if (!key) throw new Error(`unexpected url: ${url}`);
      return pages[key]! as T;
    },
    async getText() {
      throw new Error("getText unused in this stub");
    },
  };
}

describe("openAlexDisplayMatchesHcp", () => {
  it("rejects unrelated Latin author for 朱同玉", () => {
    expect(
      openAlexDisplayMatchesHcp("Austin S. Ankney", "朱同玉", "Tongyu Zhu"),
    ).toBe(false);
  });
  it("accepts Tongyu Zhu", () => {
    expect(openAlexDisplayMatchesHcp("Tongyu Zhu", "朱同玉", "Tongyu Zhu")).toBe(
      true,
    );
  });
});

describe("themesFromOpenAlex", () => {
  it("does not let work-level Computer science outrank cardiology for medical authors", () => {
    const themes = themesFromOpenAlex(
      {
        x_concepts: [
          { display_name: "Medicine", score: 0.97, level: 0 },
          { display_name: "Cardiology", score: 0.84, level: 1 },
          { display_name: "Internal medicine", score: 0.82, level: 1 },
          { display_name: "Myocardial infarction", score: 0.66, level: 2 },
          { display_name: "Computer science", score: 0.49, level: 0 },
        ],
      },
      [
        {
          title: "ESC congenital heart disease",
          concepts: [{ display_name: "Computer science", score: 0.34, level: 0 }],
        },
        {
          title: "Heart failure",
          concepts: [{ display_name: "Geology", score: 0.31, level: 0 }],
        },
        {
          title: "LAA",
          concepts: [{ display_name: "Business", score: 0.33, level: 0 }],
        },
        {
          title: "PCI",
          concepts: [
            { display_name: "Conventional PCI", score: 0.58, level: 2 },
            { display_name: "Medicine", score: 0.4, level: 0 },
            { display_name: "Cardiology", score: 0.31, level: 1 },
          ],
        },
        {
          title: "HSF1",
          concepts: [{ display_name: "Computer science", score: 0.36, level: 0 }],
        },
      ],
    );

    expect(themes[0]).not.toBe("Computer science");
    expect(themes).not.toContain("Geology");
    expect(themes).not.toContain("Business");
    expect(themes.some((t) => /Cardiology|Myocardial|Internal medicine|PCI/i.test(t))).toBe(
      true,
    );
    // 专科 level≥1 应排在宽泛 Medicine 之前或紧随其后的专科位
    const cardioIdx = themes.findIndex((t) => t === "Cardiology");
    const csIdx = themes.findIndex((t) => t === "Computer science");
    expect(cardioIdx).toBeGreaterThanOrEqual(0);
    if (csIdx >= 0) expect(cardioIdx).toBeLessThan(csIdx);
  });

  it("keeps specialty themes when author is non-medical", () => {
    const themes = themesFromOpenAlex(
      {
        x_concepts: [
          { display_name: "Computer science", score: 0.9, level: 0 },
          { display_name: "Artificial intelligence", score: 0.7, level: 1 },
        ],
      },
      [
        {
          concepts: [
            { display_name: "Machine learning", score: 0.6, level: 2 },
            { display_name: "Computer science", score: 0.5, level: 0 },
          ],
        },
      ],
    );
    expect(themes[0]).toMatch(/Artificial intelligence|Machine learning|Computer science/);
    expect(themes).toContain("Artificial intelligence");
  });

  it("prefers level≥1 specialty over broad Medicine when both present", () => {
    const themes = themesFromOpenAlex(
      {
        x_concepts: [
          { display_name: "Medicine", score: 0.99, level: 0 },
          { display_name: "Nephrology", score: 0.7, level: 1 },
          { display_name: "Kidney transplantation", score: 0.65, level: 2 },
        ],
      },
      [],
    );
    expect(themes[0]).not.toBe("Medicine");
    expect(["Nephrology", "Kidney transplantation"]).toContain(themes[0]);
  });
});

describe("fetchOpenAlexWorkConcepts（B+ 论文级科室信号）", () => {
  it("should_prefer_specialty_level_concepts_over_broad_high_count", async () => {
    const seenUrls: string[] = [];
    const http: HttpClient = {
      async getJson<T>(url: string): Promise<T> {
        seenUrls.push(url);
        return {
          results: [
            {
              concepts: [
                { display_name: "Medicine", level: 0 },
                { display_name: "Hemodialysis", level: 1 },
                { display_name: "Internal medicine", level: 1 },
              ],
            },
            {
              concepts: [
                { display_name: "Medicine", level: 0 },
                { display_name: "Dialysis", level: 1 },
              ],
            },
          ],
        } as T;
      },
      async getText() {
        throw new Error("getText unused");
      },
    };
    const concepts = await fetchOpenAlexWorkConcepts(http, "A5087290651");
    // level≥1 专科概念排在宽泛 Medicine 之前，其次按出现次数
    expect(concepts[0]).toBe("Hemodialysis");
    expect(concepts).toContain("Dialysis");
    expect(concepts).toContain("Internal medicine");
    expect(concepts.indexOf("Medicine")).toBeGreaterThan(
      concepts.indexOf("Hemodialysis"),
    );
    // 轻载荷：只取 concepts 字段
    expect(seenUrls[0]).toContain("select=concepts");
    expect(seenUrls[0]).toContain("filter=author.id:A5087290651");
  });

  it("should_cap_returned_concepts_at_eight", async () => {
    const http = stubHttp({
      "api.openalex.org/works": {
        results: Array.from({ length: 5 }, () => ({
          concepts: Array.from({ length: 12 }, (_, k) => ({
            display_name: `Concept ${k}`,
            level: 1,
          })),
        })),
      },
    });
    const concepts = await fetchOpenAlexWorkConcepts(http, "A1");
    expect(concepts).toHaveLength(8);
  });

  it("should_return_empty_when_openalex_id_unparseable", async () => {
    const http = stubHttp({});
    const concepts = await fetchOpenAlexWorkConcepts(http, "");
    expect(concepts).toEqual([]);
  });
});
