import { describe, expect, it } from "vitest";
import {
  VirtualTwinSchema,
  assertAuthorIdsForLiteratureIngest,
  hasActiveP0AuthorId,
  allOpenAlexIds,
  mergeOpenAlexIds,
  bindOpenAlexId,
  normalizeOpenAlexBinding,
  mcpError,
  isMcpError,
  SCHEMA_VERSION,
} from "./index.js";

describe("AuthorIds gate", () => {
  it("hasActiveP0AuthorId requires non-empty active P0", () => {
    expect(hasActiveP0AuthorId({})).toBe(false);
    expect(hasActiveP0AuthorId({ orcid: null })).toBe(false);
    expect(hasActiveP0AuthorId({ google_scholar: "abc" })).toBe(false);
    expect(hasActiveP0AuthorId({ orcid: "0000-0001-2345-6789" })).toBe(true);
  });

  it("hasActiveP0AuthorId treats alias-only as P0 after normalize promote", () => {
    expect(
      hasActiveP0AuthorId({ openalex_aliases: ["A5087829646"] }),
    ).toBe(true);
  });

  it("assertAuthorIdsForLiteratureIngest blocks unresolved", () => {
    const r = assertAuthorIdsForLiteratureIngest("unresolved", {
      orcid: "0000-0001-2345-6789",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNRESOLVED_IDENTITY");
  });

  it("assertAuthorIdsForLiteratureIngest blocks resolved without P0", () => {
    const r = assertAuthorIdsForLiteratureIngest("resolved", {
      google_scholar: "Yby_S-sAAAAJ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("AUTHOR_IDS_REQUIRED");
  });

  it("assertAuthorIdsForLiteratureIngest allows resolved + ORCID", () => {
    const r = assertAuthorIdsForLiteratureIngest("resolved", {
      orcid: "0000-0001-2345-6789",
    });
    expect(r).toEqual({ ok: true });
  });
});

describe("multi OpenAlex (ADR-004)", () => {
  it("mergeOpenAlexIds sets primary + aliases with preferred", () => {
    const r = mergeOpenAlexIds(
      ["A5087829646", "A5087830123", "A5087829646", null],
      "A5087830123",
    );
    expect(r.openalex).toBe("A5087830123");
    expect(r.openalex_aliases).toEqual(["A5087829646"]);
  });

  it("allOpenAlexIds returns primary then aliases", () => {
    expect(
      allOpenAlexIds({
        openalex: "A1",
        openalex_aliases: ["A2", "A1", "A3"],
      }),
    ).toEqual(["A1", "A2", "A3"]);
  });

  it("bindOpenAlexId promote keeps old as alias", () => {
    const r = bindOpenAlexId(
      { openalex: "A5087829646", openalex_aliases: ["A99"] },
      "A5087830123",
      { promote: true },
    );
    expect(r.openalex).toBe("A5087830123");
    expect(r.openalex_aliases).toEqual(["A5087829646", "A99"]);
  });

  it("normalizeOpenAlexBinding drops primary from aliases", () => {
    const r = normalizeOpenAlexBinding({
      openalex: "https://openalex.org/authors/A5087829646",
      openalex_aliases: ["A5087829646", "A5087830123"],
    });
    expect(r.openalex).toBe("A5087829646");
    expect(r.openalex_aliases).toEqual(["A5087830123"]);
  });

  it("VirtualTwinSchema accepts openalex_aliases", () => {
    const r = VirtualTwinSchema.safeParse({
      meta: {
        schema_version: SCHEMA_VERSION,
        hcp_id: "hcp_a5087829646",
        as_of: "2026-07-22",
        twin_version: 1,
      },
      profile: {
        name_zh: "张文宏",
        hospital: "复旦大学附属华山医院",
        department: "感染科",
        disambiguation_status: "ambiguous" as const,
        specialties: [],
        external_ids: {
          openalex: "A5087829646",
          openalex_aliases: ["A5087830123"],
        },
      },
      research: {
        author_ids: {
          openalex: "A5087829646",
          openalex_aliases: ["A5087830123"],
        },
      },
    });
    expect(r.success).toBe(true);
  });
});

describe("VirtualTwinSchema A9", () => {
  const base = {
    meta: {
      schema_version: SCHEMA_VERSION,
      hcp_id: "hcp_zhu_tongyu",
      as_of: "2026-07-16",
      twin_version: 1,
    },
    profile: {
      name_zh: "朱同玉",
      hospital: "复旦大学附属中山医院",
      department: "肾脏移植科",
      disambiguation_status: "resolved" as const,
      specialties: ["肾移植"],
      tags: {
        hcp_tier: "T1" as const,
        role_tags: ["kol" as const],
      },
      external_ids: { orcid: "0000-0002-1111-2222" },
    },
    research: {
      author_ids: { orcid: "0000-0002-1111-2222" },
    },
  };

  it("accepts resolved twin with P0 AuthorId", () => {
    const r = VirtualTwinSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("accepts resolved twin using profile.external_ids only", () => {
    const r = VirtualTwinSchema.safeParse({
      ...base,
      research: undefined,
    });
    expect(r.success).toBe(true);
  });

  it("rejects resolved twin without P0 AuthorId", () => {
    const r = VirtualTwinSchema.safeParse({
      ...base,
      profile: {
        ...base.profile,
        external_ids: { google_scholar: "x" },
      },
      research: { author_ids: { google_scholar: "x" } },
    });
    expect(r.success).toBe(false);
  });

  it("rejects resolved without tags.hcp_tier", () => {
    const r = VirtualTwinSchema.safeParse({
      ...base,
      profile: {
        ...base.profile,
        tags: undefined,
      },
    });
    expect(r.success).toBe(false);
  });

  it("assertNoComplianceForbiddenFields throws", async () => {
    const { assertNoComplianceForbiddenFields } = await import("./twin.js");
    expect(() =>
      assertNoComplianceForbiddenFields({ 处方量: 1 }),
    ).toThrow(/COMPLIANCE_BLOCKED/);
    expect(() => assertNoComplianceForbiddenFields({ ok: true })).not.toThrow();
  });
});

describe("mcpError", () => {
  it("shapes structured MCP_ERROR", () => {
    const e = mcpError("NOT_FOUND", "未知 hcpId", {
      repair_hint: "先 resolve 并确认保存",
    });
    expect(isMcpError(e)).toBe(true);
    expect(e.retryable).toBe(false);
  });
});
