import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMemoryStore } from "./store.js";
import { resolveHcpIdentity } from "./tools.js";

vi.mock("./collectors/openalex.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./collectors/openalex.js")>();
  return {
    ...actual,
    searchOpenAlexAuthors: vi.fn(),
    fetchOpenAlexWorkConcepts: vi.fn(),
  };
});

import {
  fetchOpenAlexWorkConcepts,
  searchOpenAlexAuthors,
} from "./collectors/openalex.js";

/** live 模式内存库：不落库、不外网（采集器已 mock） */
function liveStore() {
  return { ...createMemoryStore(), mode: "live" as const };
}

function mockHits(
  rows: Array<{
    id: string;
    display_name: string;
    institution?: string;
    orcid?: string | null;
    concepts?: string[];
  }>,
) {
  vi.mocked(searchOpenAlexAuthors).mockResolvedValue(rows);
}

/** feature-12 跟进（B+ 设计）：论文级概念懒加载默认空，需要富化的用例单独覆写 */
beforeEach(() => {
  vi.mocked(fetchOpenAlexWorkConcepts).mockReset();
  vi.mocked(fetchOpenAlexWorkConcepts).mockResolvedValue([]);
});

describe("resolve_hcp_identity 科室来源标注与数据源对照（MCP2-09 / DEF-005）", () => {
  it("should_annotate_caller_input_provenance_and_signal_mismatch_on_live_candidates", async () => {
    mockHits([
      {
        id: "A123",
        display_name: "Lu Lin",
        institution: "Peking University Sixth Hospital",
        orcid: null,
        concepts: ["Psychiatry", "Medicine"],
      },
    ]);
    const store = liveStore();
    const r = await resolveHcpIdentity(store, {
      name: "陆林",
      hospital: "北京大学第六医院",
      dept: "神经科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const candidate = r.data.candidates[0]!;
    // 科室原样回显调用方输入，不自动改写
    expect(candidate.department).toBe("神经科");
    // 来源标注：caller_input · 未经核实
    expect(candidate.department_provenance).toEqual({
      origin: "caller_input",
      verified: false,
    });
    // 数据源信号：主题词原文 + 归一化受控专科键
    expect(candidate.department_signal).toEqual({
      topics: ["Psychiatry", "Medicine"],
      specialty: "psychiatry",
    });
    // 输入侧（neurology）与信号侧（psychiatry）不一致 → mismatch 提示
    expect(candidate.department_mismatch).toEqual({
      input_side: "neurology",
      signal_side: "psychiatry",
    });
    // mismatch 不阻塞：状态仍为 ambiguous
    expect(r.data.disambiguation_status).toBe("ambiguous");
  });

  it("should_omit_mismatch_when_both_sides_normalize_to_same_key", async () => {
    mockHits([
      {
        id: "A456",
        display_name: "Test Author",
        orcid: null,
        concepts: ["Psychiatry"],
      },
    ]);
    const store = liveStore();
    const r = await resolveHcpIdentity(store, {
      name: "某医生",
      hospital: "某医院",
      dept: "精神科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const candidate = r.data.candidates[0]!;
    expect(candidate.department_signal?.specialty).toBe("psychiatry");
    expect(candidate.department_mismatch).toBeUndefined();
  });

  it("should_degrade_to_provenance_only_without_signal_specialty", async () => {
    mockHits([
      {
        id: "A789",
        display_name: "Broad Author",
        orcid: null,
        concepts: ["Medicine"],
      },
    ]);
    const store = liveStore();
    const r = await resolveHcpIdentity(store, {
      name: "某医生",
      hospital: "某医院",
      dept: "精神科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const candidate = r.data.candidates[0]!;
    expect(candidate.department_provenance).toEqual({
      origin: "caller_input",
      verified: false,
    });
    expect(candidate.department_signal?.specialty).toBeUndefined();
    expect(candidate.department_mismatch).toBeUndefined();
  });

  it("should_degrade_to_provenance_only_when_openalex_has_no_concepts", async () => {
    mockHits([
      { id: "A000", display_name: "No Concept Author", orcid: null },
    ]);
    const store = liveStore();
    const r = await resolveHcpIdentity(store, {
      name: "某医生",
      hospital: "某医院",
      dept: "精神科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const candidate = r.data.candidates[0]!;
    expect(candidate.department_provenance).toEqual({
      origin: "caller_input",
      verified: false,
    });
    expect(candidate.department_signal).toBeUndefined();
    expect(candidate.department_mismatch).toBeUndefined();
  });

  it("should_mark_zhu_fixture_provenance_as_fixture_origin", async () => {
    // fixture 路径仅 mock 模式可达（live 空命中提前返回 unresolved）
    const r = await resolveHcpIdentity(createMemoryStore(), {
      name: "朱同玉",
      hospital: "复旦大学附属中山医院",
      dept: "肾脏移植科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const candidate of r.data.candidates) {
      expect(candidate.department_provenance?.origin).toBe("fixture");
      expect(candidate.department_provenance?.verified).toBe(false);
    }
  });

  it("should_annotate_mock_echo_candidates_as_caller_input", async () => {
    const r = await resolveHcpIdentity(createMemoryStore(), {
      name: "待核医生",
      hospital: "某医院",
      dept: "精神科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const candidate = r.data.candidates[0]!;
    expect(candidate.department).toBe("精神科");
    expect(candidate.department_provenance).toEqual({
      origin: "caller_input",
      verified: false,
    });
    expect(candidate.department_signal).toBeUndefined();
  });
});

describe("resolve_hcp_identity 论文级概念懒加载补信号（feature-12 跟进 / B+ 设计）", () => {
  it("should_enrich_nephrology_signal_from_work_concepts_when_author_level_fails", async () => {
    // 侯凡凡 case：作者级主题词全是泛化词，论文级 Hemodialysis 等命中概念表
    mockHits([
      {
        id: "A5087290651",
        display_name: "侯凡凡",
        institution: "Nanfang Hospital",
        orcid: null,
        concepts: ["Medicine", "Chemistry", "Internal medicine", "Immunology"],
      },
    ]);
    vi.mocked(fetchOpenAlexWorkConcepts).mockResolvedValueOnce([
      "Hemodialysis",
      "Dialysis",
      "Kidney disease",
    ]);
    const store = liveStore();
    const r = await resolveHcpIdentity(store, {
      name: "侯凡凡",
      hospital: "南方医院",
      dept: "神内科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const candidate = r.data.candidates[0]!;
    // 信号侧：论文级概念经概念表归一到 nephrology
    expect(candidate.department_signal?.specialty).toBe("nephrology");
    // 主题词合并去重：作者级原文 + 论文级补入，重复词只留一个（插入序）
    expect(candidate.department_signal?.topics).toEqual([
      "Medicine",
      "Chemistry",
      "Internal medicine",
      "Immunology",
      "Hemodialysis",
      "Dialysis",
      "Kidney disease",
    ]);
    // 输入侧（神内科 → neurology）与信号侧（nephrology）不一致 → mismatch
    expect(candidate.department_mismatch).toEqual({
      input_side: "neurology",
      signal_side: "nephrology",
    });
    expect(vi.mocked(fetchOpenAlexWorkConcepts)).toHaveBeenCalledWith(
      expect.anything(),
      "A5087290651",
    );
  });

  it("should_skip_work_concept_fetch_when_author_level_signal_resolves", async () => {
    mockHits([
      {
        id: "A123",
        display_name: "Lu Lin",
        institution: "Peking University Sixth Hospital",
        orcid: null,
        concepts: ["Psychiatry", "Medicine"],
      },
    ]);
    const store = liveStore();
    const r = await resolveHcpIdentity(store, {
      name: "陆林",
      hospital: "北京大学第六医院",
      dept: "神经科",
    });
    expect(r.ok).toBe(true);
    expect(vi.mocked(fetchOpenAlexWorkConcepts)).not.toHaveBeenCalled();
  });

  it("should_degrade_to_author_level_only_when_work_concepts_fetch_fails", async () => {
    mockHits([
      {
        id: "A789",
        display_name: "Broad Author",
        orcid: null,
        concepts: ["Medicine"],
      },
    ]);
    vi.mocked(fetchOpenAlexWorkConcepts).mockRejectedValueOnce(
      new Error("SOURCE_UNAVAILABLE api.openalex.org 503"),
    );
    const store = liveStore();
    const r = await resolveHcpIdentity(store, {
      name: "某医生",
      hospital: "某医院",
      dept: "精神科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const candidate = r.data.candidates[0]!;
    // 论文源失败：降级为仅作者级信号，不阻塞整次 resolve
    expect(candidate.department_signal).toEqual({ topics: ["Medicine"] });
    expect(candidate.department_signal?.specialty).toBeUndefined();
    expect(candidate.department_mismatch).toBeUndefined();
  });

  it("should_not_fabricate_signal_when_work_concepts_also_fail_to_map", async () => {
    mockHits([
      {
        id: "A999",
        display_name: "Generic Author",
        orcid: null,
        concepts: ["Medicine", "Computer science"],
      },
    ]);
    vi.mocked(fetchOpenAlexWorkConcepts).mockResolvedValueOnce([
      "Artificial intelligence",
      "Feature selection",
    ]);
    const store = liveStore();
    const r = await resolveHcpIdentity(store, {
      name: "某医生",
      hospital: "某医院",
      dept: "精神科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const candidate = r.data.candidates[0]!;
    // 两级主题词都推不出受控科室：不编造信号，保存仍会被 D2 门拦截
    expect(candidate.department_signal?.specialty).toBeUndefined();
    expect(candidate.department_mismatch).toBeUndefined();
  });
});
