import { describe, expect, it } from "vitest";
import { academicPointId } from "./academic.js";
import type { AcademicSeedChunk } from "./types.js";

function chunk(overrides: Partial<AcademicSeedChunk>): AcademicSeedChunk {
  return {
    text: "abstract text",
    specialty: "neurology",
    as_of: "2026-10-21",
    version: "pubmed-123",
    source: "pubmed",
    ...overrides,
  };
}

describe("academicPointId（F-RAG-033 / DEF-003）", () => {
  it("should_differ_when_same_pmid_across_specialties", () => {
    const a = academicPointId(chunk({ specialty: "neurology", pmid: "42901865" }), 0);
    const b = academicPointId(chunk({ specialty: "urology", pmid: "42901865" }), 0);
    expect(a).not.toBe(b);
  });

  it("should_be_stable_for_same_specialty_and_pmid", () => {
    const a = academicPointId(chunk({ specialty: "neurology", pmid: "42901865" }), 0);
    const b = academicPointId(chunk({ specialty: "neurology", pmid: "42901865" }), 0);
    expect(a).toBe(b);
  });

  it("should_differ_when_same_doi_across_specialties", () => {
    const a = academicPointId(chunk({ specialty: "neurology", doi: "10.1/x" }), 0);
    const b = academicPointId(chunk({ specialty: "radiology", doi: "10.1/x" }), 0);
    expect(a).not.toBe(b);
  });

  it("should_keep_fixture_fallback_key_without_pmid_or_doi", () => {
    const a = academicPointId(chunk({ specialty: "neurology" }), 3);
    const b = academicPointId(chunk({ specialty: "neurology" }), 3);
    expect(a).toBe(b);
    const other = academicPointId(chunk({ specialty: "neurology" }), 4);
    expect(other).not.toBe(a);
  });

  it("should_return_uuid_shaped_hex", () => {
    const id = academicPointId(chunk({ specialty: "neurology", pmid: "1" }), 0);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
