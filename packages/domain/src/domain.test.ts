import { describe, expect, it } from "vitest";
import {
  AuthorIdsSchema,
  VirtualTwinSchema,
  assertAuthorIdsForLiteratureIngest,
  hasActiveP0AuthorId,
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

describe("AuthorIds openalex_aliases（ADR-004）", () => {
  it("parses openalex_aliases as optional string array", () => {
    const r = AuthorIdsSchema.safeParse({
      openalex: "A1",
      openalex_aliases: ["A2", "A3"],
    });
    expect(r.success).toBe(true);
  });

  it("keeps twin parse backward compatible without aliases", () => {
    const r = AuthorIdsSchema.safeParse({ openalex: "A1" });
    expect(r.success).toBe(true);
  });
});
