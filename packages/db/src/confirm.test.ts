import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const end = vi.fn();

vi.mock("mysql2/promise", () => {
  return {
    default: {
      createPool: () => ({ query, end }),
    },
  };
});

import {
  _resetPoolForTests,
  confirmAndSaveTwin,
  normalizeAuthorIds,
  getPool,
  type ConfirmAndSaveInput,
} from "./index.js";
import { SCHEMA_VERSION, type VirtualTwin } from "@hca/domain";

function baseInput(overrides?: Partial<ConfirmAndSaveInput>): ConfirmAndSaveInput {
  return {
    hcp_id: "hcp_new",
    name_zh: "张外源",
    name_en: "Waiyuan Zhang",
    hospital: "北京协和医院",
    department: "肝胆外科",
    author_ids: { openalex: "A5016669077", openalex_aliases: ["A5016669077", "A999"] },
    ...overrides,
  };
}

function storedRow(overrides?: {
  hcp_id?: string;
  name_zh?: string;
  hospital?: string;
  department?: string;
  name_en?: string;
}) {
  const hcpId = overrides?.hcp_id ?? "hcp_existing";
  const identity = {
    name_zh: overrides?.name_zh ?? "张外源",
    name_en: overrides?.name_en,
    hospital: overrides?.hospital ?? "上海中山医院",
    department: overrides?.department ?? "肝外科",
  };
  const twin: VirtualTwin = {
    meta: {
      schema_version: SCHEMA_VERSION,
      hcp_id: overrides?.hcp_id ?? "hcp_existing",
      as_of: "2026-07-17",
      twin_version: 1,
    },
    profile: {
      name_zh: identity.name_zh,
      hospital: identity.hospital,
      department: identity.department,
      disambiguation_status: "ambiguous",
      specialties: [],
    },
  };
  return { hcp_id: hcpId, twin: JSON.stringify(twin), identity: JSON.stringify(identity) };
}

beforeEach(() => {
  query.mockReset();
  _resetPoolForTests();
  process.env.DATABASE_URL = "mysql://u:p@localhost:3306/hca";
});

describe("confirmAndSaveTwin（ADR-009 / ADR-010）", () => {
  it("should_return_invalid_when_identity_fields_missing", async () => {
    const r = await confirmAndSaveTwin(baseInput({ name_zh: " " }));
    expect(r.status).toBe("invalid");
    if (r.status !== "invalid") return;
    expect(r.code).toBe("VALIDATION_ERROR");
  });

  it("should_return_invalid_when_hcp_id_is_agent_general", async () => {
    const r = await confirmAndSaveTwin(baseInput({ hcp_id: "_agent_general" }));
    expect(r.status).toBe("invalid");
  });

  it("should_reject_existing_hcp_id_without_upsert", async () => {
    query.mockResolvedValueOnce([[storedRow()]]);
    const r = await confirmAndSaveTwin(baseInput());
    expect(r.status).toBe("invalid");
    if (r.status !== "invalid") return;
    expect(r.message).toContain("已存在");
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]![0])).toContain("hcp_id = ?");
  });

  it("should_save_identity_twin_with_empty_insights_when_no_duplicate", async () => {
    query.mockResolvedValueOnce([[]]); // getTwin：编号不存在
    query.mockResolvedValueOnce([[storedRow({ name_zh: "完全无关" })]]); // 查重扫描
    const r = await confirmAndSaveTwin(baseInput());
    expect(r.status).toBe("saved");
    if (r.status !== "saved") return;
    expect(r.hcp_id).toBe("hcp_new");
    expect(r.twin.meta.twin_version).toBe(1);
    expect(r.twin.meta.build_mode).toBe("full");
    expect(r.twin.profile.disambiguation_status).toBe("ambiguous");
    expect(r.twin.profile.specialties).toEqual([]);
    expect(r.twin.research?.themes).toEqual([]);
    expect(r.twin.profile.tags).toMatchObject({
      hcp_tier: "T2",
      role_tags: [],
      tag_confidence: "low",
      tag_method: "rule",
      evidence_refs: ["confirm_identity"],
    });
    // ADR-004：主 ID + 别名去重且不含主 ID；research 与 external_ids 镜像
    expect(r.twin.research?.author_ids).toMatchObject({
      openalex: "A5016669077",
      openalex_aliases: ["A999"],
    });
    expect(r.twin.profile.external_ids).toEqual(r.twin.research?.author_ids);

    const insertSqls = query.mock.calls.map((c) => String(c[0]));
    expect(insertSqls.some((s) => s.startsWith("INSERT INTO hcp_twins"))).toBe(true);
    expect(insertSqls.some((s) => s.startsWith("INSERT INTO hcp_insights"))).toBe(true);
    const insightsCall = query.mock.calls.find((c) =>
      String(c[0]).startsWith("INSERT INTO hcp_insights"),
    );
    const insights = JSON.parse(insightsCall![1]![1] as string);
    expect(insights.doing_now).toBeUndefined();
    expect(insights.interest_directions).toEqual([]);
  });

  it("should_merge_extra_evidence_refs_into_tags_when_provided（MCP2-10 / DEF-006）", async () => {
    query.mockResolvedValueOnce([[]]); // getTwin：编号不存在
    query.mockResolvedValueOnce([[storedRow({ name_zh: "完全无关" })]]); // 查重扫描
    const r = await confirmAndSaveTwin(
      baseInput({
        department: "肾内科",
        extra_evidence_refs: ["department_signal", "department_checked"],
      }),
    );
    expect(r.status).toBe("saved");
    if (r.status !== "saved") return;
    expect(r.twin.identity?.department).toBe("肾内科");
    expect(r.twin.profile.tags?.evidence_refs).toEqual([
      "confirm_identity",
      "department_signal",
      "department_checked",
    ]);
  });

  it("should_return_confirmation_required_sorted_by_org_match", async () => {
    const sameHospDept = storedRow({
      hcp_id: "hcp_dup1",
      hospital: "北京协和医院",
      department: "肝胆外科",
    });
    const otherHosp = storedRow({ hcp_id: "hcp_dup2", hospital: "其他医院" });
    query.mockResolvedValueOnce([[]]);
    query.mockResolvedValueOnce([[sameHospDept, otherHosp]]);
    const r = await confirmAndSaveTwin(baseInput());
    expect(r.status).toBe("confirmation_required");
    if (r.status !== "confirmation_required") return;
    expect(r.possible_duplicates).toHaveLength(2);
    expect(r.possible_duplicates[0]!.hcp_id).toBe("hcp_dup1");
    expect(r.possible_duplicates[0]!.match_tier).toBe(0);
    expect(r.possible_duplicates[1]!.hcp_id).toBe("hcp_dup2");
    const insertSqls = query.mock.calls.map((c) => String(c[0]));
    expect(insertSqls.some((s) => s.startsWith("INSERT"))).toBe(false);
  });

  it("should_write_when_confirm_not_duplicate_true", async () => {
    query.mockResolvedValueOnce([[]]);
    const r = await confirmAndSaveTwin(baseInput({ confirm_not_duplicate: true }));
    expect(r.status).toBe("saved");
  });

  it("should_catch_latin_tier_hits_as_duplicates", async () => {
    const latinHit = storedRow({
      hcp_id: "hcp_latin",
      name_zh: "张外源拼音簇",
      name_en: "Waiyuan Zhangg",
      hospital: "别的医院",
    });
    query.mockResolvedValueOnce([[]]);
    query.mockResolvedValueOnce([[latinHit]]);
    const r = await confirmAndSaveTwin(baseInput());
    expect(r.status).toBe("confirmation_required");
  });

  it("should_cap_duplicates_at_20_with_truncated_flag", async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      storedRow({ hcp_id: `hcp_dup_${i}`, hospital: "同医院", department: "同科室" }),
    );
    query.mockResolvedValueOnce([[]]);
    query.mockResolvedValueOnce([rows]);
    const r = await confirmAndSaveTwin(baseInput());
    expect(r.status).toBe("confirmation_required");
    if (r.status !== "confirmation_required") return;
    expect(r.possible_duplicates).toHaveLength(20);
    expect(r.truncated).toBe(true);
  });
});

describe("normalizeAuthorIds（ADR-004）", () => {
  it("should_dedupe_aliases_and_drop_primary", () => {
    const r = normalizeAuthorIds({
      openalex: "A1",
      openalex_aliases: ["A1", "A2", "A2", ""],
    });
    expect(r?.openalex).toBe("A1");
    expect(r?.openalex_aliases).toEqual(["A2"]);
  });

  it("should_drop_aliases_key_when_empty", () => {
    const r = normalizeAuthorIds({ openalex: "A1", openalex_aliases: ["A1"] });
    expect(r?.openalex_aliases).toBeUndefined();
  });

  it("should_return_undefined_for_missing_input", () => {
    expect(normalizeAuthorIds(undefined)).toBeUndefined();
  });
});

describe("pool smoke", () => {
  it("should_expose_pool_via_getPool", () => {
    expect(getPool()).toBeTruthy();
  });
});