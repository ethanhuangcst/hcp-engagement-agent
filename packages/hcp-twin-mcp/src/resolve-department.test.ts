import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "./store.js";
import { resolveHcpIdentity } from "./tools.js";

vi.mock("./collectors/openalex.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./collectors/openalex.js")>();
  return {
    ...actual,
    searchOpenAlexAuthors: vi.fn(),
  };
});

import { searchOpenAlexAuthors } from "./collectors/openalex.js";

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
