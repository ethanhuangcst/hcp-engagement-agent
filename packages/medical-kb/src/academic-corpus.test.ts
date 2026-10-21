import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const corpusRoot = mkdtempSync(join(tmpdir(), "academic-corpus-test-"));


vi.mock("./config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config.js")>();
  return {
    ...actual,
    getAcademicCorpusRoot: () => corpusRoot,
    getCorpusRoot: () => corpusRoot,
  };
});

import {
  bootstrapAcademicCorpus,
  ensureAcademicCorpusDir,
  ensureAcademicCorpusFromFixtures,
  hasAcademicFixture,
} from "./academic.js";
import type { AcademicSeedChunk } from "./types.js";

// 真实 fixture 只含 kidney_transplant / phage_therapy；其余键视为无 fixture
const NO_FIXTURE_SPECIALTIES = ["hematology", "radiology", "neurology"];

function makePubmedChunk(specialty: string, pmid: string): AcademicSeedChunk {
  return {
    text: `pubmed abstract ${pmid}`,
    specialty,
    as_of: "2026-10-21",
    version: `pubmed-${pmid}`,
    pmid,
    source: "pubmed",
    language: "en",
    authority: "pubmed",
  };
}

beforeEach(() => {
  for (const specialty of NO_FIXTURE_SPECIALTIES) {
    rmSync(join(corpusRoot, specialty), { recursive: true, force: true });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bootstrapAcademicCorpus 语料引导三路径（feature-09 MKB2-02）", () => {
  it("should_use_fixture_corpus_when_fixture_present", async () => {
    const { corpusPath, chunks } = await bootstrapAcademicCorpus(
      "kidney_transplant",
      undefined,
      async () => [],
    );
    expect(hasAcademicFixture("kidney_transplant")).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(existsSync(corpusPath)).toBe(true);
  });

  it("should_start_empty_and_merge_pubmed_when_no_fixture_and_fetch_returns_chunks", async () => {
    const fetched = [makePubmedChunk("hematology", "111"), makePubmedChunk("hematology", "222")];
    const { corpusPath, chunks } = await bootstrapAcademicCorpus(
      "hematology",
      undefined,
      async () => fetched,
    );
    expect(chunks).toHaveLength(2);
    const onDisk = readFileSync(corpusPath, "utf8").split("\n").filter((l) => l.trim());
    expect(onDisk).toHaveLength(2);
  });

  it("should_dedupe_pubmed_chunks_against_existing_corpus", async () => {
    const first = [makePubmedChunk("radiology", "333")];
    await bootstrapAcademicCorpus("radiology", undefined, async () => first);
    const second = [makePubmedChunk("radiology", "333"), makePubmedChunk("radiology", "444")];
    const { chunks } = await bootstrapAcademicCorpus(
      "radiology",
      undefined,
      async () => second,
    );
    expect(chunks).toHaveLength(2);
  });

  it("should_throw_SOURCES_UNAVAILABLE_when_no_fixture_and_fetch_returns_zero", async () => {
    await expect(
      bootstrapAcademicCorpus("radiology", undefined, async () => []),
    ).rejects.toThrow(
      expect.objectContaining({ code: "SOURCES_UNAVAILABLE" }),
    );
  });
});

describe("corpus helpers（feature-09）", () => {
  it("hasAcademicFixture_should_report_existing_fixture_only", () => {
    expect(hasAcademicFixture("kidney_transplant")).toBe(true);
    expect(hasAcademicFixture("hematology")).toBe(false);
  });

  it("ensureAcademicCorpusDir_should_create_dir_and_return_chunks_path", () => {
    const p = ensureAcademicCorpusDir("hematology");
    expect(p.endsWith(join("hematology", "chunks.jsonl"))).toBe(true);
  });

  it("ensureAcademicCorpusFromFixtures_should_throw_CORPUS_PATH_INVALID_when_fixture_missing", () => {
    expect(() =>
      ensureAcademicCorpusFromFixtures("radiology"),
    ).toThrow(expect.objectContaining({ code: "CORPUS_PATH_INVALID" }));
  });
});
