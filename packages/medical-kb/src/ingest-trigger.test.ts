import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestOnDemand } from "./academic.js";
import {
  DEPARTMENT_PATTERNS,
  resolveSpecialtiesForIngest,
  resolveSpecialtyPreview,
  triggerKnowledgeIngest,
} from "./ingest-trigger.js";

vi.mock("./academic.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./academic.js")>();
  return {
    ...actual,
    ingestOnDemand: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(ingestOnDemand).mockResolvedValue({
    jobId: "job_mock",
    knowledge_status: "ready",
  });
});

describe("resolveSpecialtiesForIngest（F-WEB-039 / ADR-014 提取回归）", () => {
  it("should_resolve_controlled_keys_from_specialties_themes_and_department", () => {
    const keys = resolveSpecialtiesForIngest({
      specialties: ["肾移植"],
      themes: ["噬菌体疗法"],
      department: "肾移植科",
    });
    expect(keys).toEqual(["kidney_transplant", "phage_therapy"]);
  });

  it("should_skip_uncontrolled_names_silently", () => {
    const keys = resolveSpecialtiesForIngest({
      specialties: ["糖尿病", "kidney_transplant"],
    });
    expect(keys).toEqual(["kidney_transplant"]);
  });

  it("should_return_empty_without_any_known_signal", () => {
    expect(resolveSpecialtiesForIngest({})).toEqual([]);
    expect(resolveSpecialtiesForIngest({ department: "整形外科" })).toEqual(
      [],
    );
  });
});

describe("resolveSpecialtyPreview（MCP2-09 / DEF-005 映射预览明细视图）", () => {
  it("should_mark_department_match_as_matched_row", () => {
    expect(resolveSpecialtyPreview({ department: "精神科" })).toEqual([
      { input: "精神科", specialty: "psychiatry", matched: true },
    ]);
  });

  it("should_mark_unmappable_department_as_matched_false_row", () => {
    expect(resolveSpecialtyPreview({ department: "整形外科" })).toEqual([
      { input: "整形外科", specialty: null, matched: false },
    ]);
  });

  it("should_skip_empty_department_without_rows", () => {
    expect(resolveSpecialtyPreview({ department: "" })).toEqual([]);
    expect(resolveSpecialtyPreview({})).toEqual([]);
  });

  it("should_mark_uncontrolled_specialty_names_as_matched_false_rows", () => {
    const rows = resolveSpecialtyPreview({
      specialties: ["糖尿病", "kidney_transplant"],
    });
    expect(rows).toEqual([
      { input: "糖尿病", specialty: null, matched: false },
      {
        input: "kidney_transplant",
        specialty: "kidney_transplant",
        matched: true,
      },
    ]);
  });

  it("should_track_each_department_pattern_match_as_row", () => {
    const rows = resolveSpecialtyPreview({
      department: "肾移植科（肾内科）",
    });
    expect(rows).toEqual([
      { input: "肾移植科（肾内科）", specialty: "kidney_transplant", matched: true },
      { input: "肾移植科（肾内科）", specialty: "nephrology", matched: true },
    ]);
  });

  it("should_keep_preview_keys_consistent_with_resolve_keys", () => {
    const input = {
      specialties: ["肾移植", "糖尿病"],
      themes: ["噬菌体疗法"],
      department: "精神科",
      tags_draft: { role_tags: ["neurology"] },
    };
    const matchedKeys = resolveSpecialtyPreview(input)
      .filter((r) => r.matched && r.specialty)
      .map((r) => r.specialty as string);
    expect([...new Set(matchedKeys)]).toEqual(
      resolveSpecialtiesForIngest(input),
    );
  });
});

describe("DEPARTMENT_PATTERNS（feature-09 MKB2-02 数据驱动科室正则）", () => {
  it("should_keep_legacy_three_patterns_first", () => {
    expect(DEPARTMENT_PATTERNS[0]).toEqual([
      /肾移植|肾脏移植|移植/,
      "kidney_transplant",
    ]);
    expect(DEPARTMENT_PATTERNS[1]).toEqual([/噬菌体/, "phage_therapy"]);
    expect(DEPARTMENT_PATTERNS[2]).toEqual([/唐氏|遗传/, "down_syndrome"]);
  });

  it("should_resolve_new_departments_to_expanded_keys", () => {
    const cases: [string, string][] = [
      ["心血管内科", "cardiology"],
      ["呼吸内科", "respiratory_medicine"],
      ["消化内科", "gastroenterology"],
      ["内分泌科", "endocrinology"],
      ["肾内科", "nephrology"],
      ["血液内科", "hematology"],
      ["风湿免疫科", "rheumatology"],
      ["感染科", "infectious_disease"],
      ["普外科", "general_surgery"],
      ["骨科", "orthopedics"],
      ["泌尿外科", "urology"],
      ["妇产科", "obstetrics_gynecology"],
      ["儿科", "pediatrics"],
      ["肿瘤科", "oncology"],
      ["精神科", "psychiatry"],
      ["皮肤科", "dermatology"],
      ["眼科", "ophthalmology"],
      ["耳鼻喉科", "otolaryngology"],
      ["麻醉科", "anesthesiology"],
      ["急诊科", "emergency_medicine"],
      ["放射科", "radiology"],
      ["康复医学科", "rehabilitation_medicine"],
      ["心胸外科", "cardiothoracic_surgery"],
    ];
    for (const [dept, key] of cases) {
      const keys = resolveSpecialtiesForIngest({ department: dept });
      expect(keys, `department=${dept}`).toContain(key);
    }
  });

  it("should_map_neurosurgery_before_neurology_for_neurosurgery_dept", () => {
    const keys = resolveSpecialtiesForIngest({ department: "神经外科" });
    expect(keys).toEqual(["neurosurgery"]);
  });

  it("should_map_neurology_for_general_neurology_dept", () => {
    expect(resolveSpecialtiesForIngest({ department: "神经内科" })).toEqual([
      "neurology",
    ]);
    expect(resolveSpecialtiesForIngest({ department: "神经病" })).toEqual([
      "neurology",
    ]);
  });

  it("should_map_kidney_transplant_before_nephrology_for_transplant_dept", () => {
    const keys = resolveSpecialtiesForIngest({
      department: "肾移植科（肾内科）",
    });
    expect(keys[0]).toBe("kidney_transplant");
    expect(keys).toContain("nephrology");
  });
});

describe("triggerKnowledgeIngest（F-WEB-039 / ADR-014 提取回归）", () => {
  it("should_push_job_refs_on_success", async () => {
    const jobs = await triggerKnowledgeIngest({ specialties: ["肾移植"] });
    expect(ingestOnDemand).toHaveBeenCalledWith({
      specialty: "kidney_transplant",
      themes: undefined,
      hcpId: undefined,
    });
    expect(jobs).toEqual([
      {
        specialty: "kidney_transplant",
        jobId: "job_mock",
        knowledge_status: "ready",
      },
    ]);
  });

  it("should_record_pending_when_ingest_already_in_progress", async () => {
    vi.mocked(ingestOnDemand).mockRejectedValueOnce(
      Object.assign(new Error("ingest in progress"), {
        code: "INGEST_IN_PROGRESS",
        details: { jobId: "job_42" },
      }),
    );
    const jobs = await triggerKnowledgeIngest({ specialties: ["肾移植"] });
    expect(jobs).toEqual([
      {
        specialty: "kidney_transplant",
        jobId: "job_42",
        knowledge_status: "pending",
      },
    ]);
  });

  it("should_swallow_other_errors_and_continue", async () => {
    vi.mocked(ingestOnDemand).mockRejectedValueOnce(
      Object.assign(new Error("boom"), { code: "INTERNAL_ERROR" }),
    );
    const jobs = await triggerKnowledgeIngest({
      specialties: ["肾移植", "噬菌体"],
    });
    expect(jobs).toEqual([
      {
        specialty: "phage_therapy",
        jobId: "job_mock",
        knowledge_status: "ready",
      },
    ]);
  });
});
