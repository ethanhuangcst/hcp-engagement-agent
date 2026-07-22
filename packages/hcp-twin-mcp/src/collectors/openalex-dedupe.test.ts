import { describe, expect, it } from "vitest";
import { dedupeOpenAlexWorks } from "./openalex.js";

describe("dedupeOpenAlexWorks", () => {
  it("dedupes by DOI across author clusters", () => {
    const out = dedupeOpenAlexWorks([
      {
        id: "W1",
        doi: "https://doi.org/10.1000/a",
        title: "Paper A",
        publication_year: 2020,
      },
      {
        id: "W2",
        doi: "10.1000/a",
        title: "Paper A (dup)",
        publication_year: 2020,
      },
      {
        id: "W3",
        doi: "10.1000/b",
        title: "Paper B",
        publication_year: 2021,
      },
    ]);
    expect(out.map((w) => w.id)).toEqual(["W1", "W3"]);
  });

  it("dedupes by normalized title when DOI missing", () => {
    const out = dedupeOpenAlexWorks([
      { id: "W1", title: "COVID-19 Clinic", publication_year: 2020 },
      { id: "W2", title: "covid 19 clinic", publication_year: 2020 },
      { id: "W3", title: "Other Paper", publication_year: 2021 },
    ]);
    expect(out.map((w) => w.id)).toEqual(["W1", "W3"]);
  });
});
