import { describe, expect, it } from "vitest";
import {
  CONTROLLED_SPECIALTY_KEYS,
  normalizeSpecialty,
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
