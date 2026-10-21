import { describe, expect, it } from "vitest";
import {
  CONTROLLED_SPECIALTY_KEYS,
  CONTROLLED_KEYS,
  normalizeSpecialty,
  OPENALEX_CONCEPT_SPECIALTY_KEYS,
  openAlexConceptSpecialty,
  specialtyDisplayName,
  tryNormalizeSpecialty,
} from "./specialty.js";

describe("tryNormalizeSpecialty", () => {
  it("should_return_null_when_specialty_has_no_controlled_alias", () => {
    expect(tryNormalizeSpecialty("肝胆外科")).toBeNull();
  });

  it("should_resolve_known_chinese_alias", () => {
    expect(tryNormalizeSpecialty("肾移植")).toBe("kidney_transplant");
  });
});

describe("normalizeSpecialty", () => {
  it("should_throw_SPECIALTY_UNRESOLVED_when_alias_missing", () => {
    expect(() => normalizeSpecialty("肝胆外科")).toThrow(
      expect.objectContaining({ code: "SPECIALTY_UNRESOLVED" }),
    );
  });
});

/** feature-12（MCP2-10 / DEF-006，D2）：受控专科键 → 标准中文名反查（入库科室来源） */
describe("specialtyDisplayName（MCP2-10 / DEF-006）", () => {
  it("should_return_standard_chinese_name_for_known_keys", () => {
    expect(specialtyDisplayName("nephrology")).toBe("肾内科");
    expect(specialtyDisplayName("psychiatry")).toBe("精神科");
    expect(specialtyDisplayName("kidney_transplant")).toBe("肾移植");
  });

  it("should_return_non_empty_name_for_every_controlled_key", () => {
    for (const key of CONTROLLED_SPECIALTY_KEYS) {
      const name = specialtyDisplayName(key);
      expect(typeof name).toBe("string");
      expect(name?.length).toBeGreaterThan(0);
    }
  });

  it("should_return_undefined_when_key_unknown", () => {
    expect(specialtyDisplayName("hepatobiliary_surgery")).toBeUndefined();
    expect(specialtyDisplayName("")).toBeUndefined();
    expect(specialtyDisplayName("Nephrology")).toBeUndefined();
  });
});

/** feature-12 跟进（DEF-006 / MCP2-09，B+ 设计）：OpenAlex 概念名 → 受控专科键 */
describe("openAlexConceptSpecialty（B+ 论文级科室信号）", () => {
  it("should_map_verified_nephrology_concepts_to_nephrology", () => {
    // 侯凡凡 case 经 OpenAlex 论文概念核验的词表
    const concepts = [
      "Hemodialysis",
      "Dialysis",
      "Kidney disease",
      "Nephropathy",
      "Chronic renal failure",
      "Nephrology",
    ];
    for (const concept of concepts) {
      expect(openAlexConceptSpecialty(concept)).toBe("nephrology");
    }
  });

  it("should_return_null_for_broad_or_unmapped_concepts", () => {
    for (const concept of [
      "Medicine",
      "Internal medicine",
      "Immunology",
      "Computer science",
      "Chemistry",
    ]) {
      expect(openAlexConceptSpecialty(concept)).toBeNull();
    }
  });

  it("should_only_map_to_controlled_specialty_keys", () => {
    for (const [, key] of OPENALEX_CONCEPT_SPECIALTY_KEYS) {
      expect(CONTROLLED_KEYS.has(key)).toBe(true);
    }
  });
});


describe("CONTROLLED_SPECIALTY_KEYS（feature-09 MKB2-02 目录扩充）", () => {
  it("should_contain_28_controlled_keys_after_expansion", () => {
    expect(CONTROLLED_SPECIALTY_KEYS).toHaveLength(28);
    expect(CONTROLLED_SPECIALTY_KEYS).toEqual([...CONTROLLED_SPECIALTY_KEYS].sort());
  });

  it("should_normalize_every_controlled_key_to_itself", () => {
    for (const key of CONTROLLED_SPECIALTY_KEYS) {
      expect(normalizeSpecialty(key).specialty).toBe(key);
    }
  });

  it("should_normalize_chinese_alias_for_each_expanded_specialty", () => {
    const samples: [string, string][] = [
      ["神经内科", "neurology"],
      ["神经病学", "neurology"],
      ["神经外科", "neurosurgery"],
      ["心血管内科", "cardiology"],
      ["呼吸内科", "respiratory_medicine"],
      ["消化内科", "gastroenterology"],
      ["内分泌科", "endocrinology"],
      ["肾内科", "nephrology"],
      ["血液科", "hematology"],
      ["风湿免疫科", "rheumatology"],
      ["感染科", "infectious_disease"],
      ["普外科", "general_surgery"],
      ["骨科", "orthopedics"],
      ["心胸外科", "cardiothoracic_surgery"],
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
      ["康复科", "rehabilitation_medicine"],
    ];
    for (const [alias, key] of samples) {
      expect(tryNormalizeSpecialty(alias)).toBe(key);
    }
  });

  it("should_still_reject_uncontrolled_names", () => {
    expect(tryNormalizeSpecialty("肝胆外科")).toBeNull();
    expect(tryNormalizeSpecialty("全科")).toBeNull();
  });
});
