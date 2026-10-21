import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type VirtualTwin } from "@hca/domain";
import {
  formatQueryHcpForDisplay,
  type QueryHcpExternalItem,
} from "./query-hcp-format.js";

function sampleTwin(id: string, dept: string): VirtualTwin {
  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      hcp_id: id,
      as_of: "2026-10-21",
      twin_version: 1,
    },
    profile: {
      name_zh: "测试",
      hospital: "测试医院",
      department: dept,
      disambiguation_status: "resolved",
      specialties: [],
      external_ids: {},
      tags: { hcp_tier: "T1", role_tags: [] },
    },
    research: { author_ids: {} },
  };
}

describe("formatQueryHcpForDisplay", () => {
  it("should_list_in_library_and_external_when_both_present", () => {
    const external: QueryHcpExternalItem = {
      candidate_id: "cand_test_token",
      name_zh: "侯凡凡",
      hospital: "南方医院",
      department: "神内科",
      distinguish: "OpenAlex 命中",
      match_note: "live OpenAlex",
      confidence: "high",
      department_signal: { topics: ["Medicine"] },
    };
    const text = formatQueryHcpForDisplay({
      count: 0,
      items: [],
      external: { count: 1, items: [external] },
    });
    expect(text).toContain("【库内已保存】0 条");
    expect(text).toContain("【库外候选】1 条");
    expect(text).toContain("1. 侯凡凡");
    expect(text).toContain("不会写入数据库");
    expect(text).toContain("cand_test_token");
    expect(text).not.toContain('"count":');
  });

  it("should_show_ingest_department_when_signal_specialty_maps", () => {
    const external: QueryHcpExternalItem = {
      candidate_id: "cand_x",
      name_zh: "宁光",
      hospital: "瑞金医院",
      department: "神经病",
      distinguish: "命中",
      match_note: "note",
      confidence: "high",
      department_signal: { specialty: "endocrinology", topics: [] },
      department_mismatch: { input_side: "neurology", signal_side: "endocrinology" },
    };
    const text = formatQueryHcpForDisplay({
      count: 0,
      items: [],
      external: { count: 1, items: [external] },
    });
    // B+ 卡片：科室判断 + 是否按公开数据科室入库的问句
    expect(text).toContain(
      "科室判断：公开数据指向 内分泌科，与你输入的 神经病 不一致",
    );
    expect(text).toContain(
      "是否按 内分泌科 入库？确认后在 add_hcp 传 confirm_department_checked: true",
    );
  });

  it("should_list_topics_and_consistent_department_when_signal_matches_input", () => {
    const external: QueryHcpExternalItem = {
      candidate_id: "cand_y",
      name_zh: "某肾内科医生",
      hospital: "某医院",
      department: "肾内科",
      distinguish: "命中",
      match_note: "note",
      confidence: "medium",
      department_signal: {
        specialty: "nephrology",
        topics: ["Hemodialysis", "Dialysis", "Kidney disease", "Medicine"],
      },
    };
    const text = formatQueryHcpForDisplay({
      count: 0,
      items: [],
      external: { count: 1, items: [external] },
    });
    // 卡片列出记录自身主题词（前 6 个），人可据此核对
    expect(text).toContain("主题词：Hemodialysis、Dialysis、Kidney disease、Medicine");
    expect(text).toContain("科室判断：公开数据指向 肾内科，与输入一致");
    expect(text).toContain("保存后档案科室为 肾内科");
    expect(text).not.toContain("不一致");
  });

  it("should_summarize_in_library_twin_on_one_line", () => {
    const text = formatQueryHcpForDisplay({
      count: 1,
      items: [sampleTwin("hcp_abc", "肾内科")],
    });
    expect(text).toContain("hcp_id=hcp_abc");
    expect(text).toContain("肾内科");
  });
});
