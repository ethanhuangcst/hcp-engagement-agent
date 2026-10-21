import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type VirtualTwin } from "@hca/domain";
import type { TwinListItem } from "@hca/db";
import {
  formatAddHcpSavedForDisplay,
  formatDepartmentConfirmationForDisplay,
  formatDuplicateConfirmationForDisplay,
  formatListHcpForDisplay,
} from "./mcp-display.js";

function sampleTwin(): VirtualTwin {
  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      hcp_id: "hcp_saved",
      as_of: "2026-10-21",
      twin_version: 1,
    },
    identity: {
      name_zh: "葛均波",
      hospital: "复旦大学附属中山医院",
      department: "内分泌科",
    },
    profile: {
      name_zh: "葛均波",
      hospital: "复旦大学附属中山医院",
      department: "内分泌科",
      disambiguation_status: "resolved",
      specialties: [],
      external_ids: {},
      tags: { hcp_tier: "T1", role_tags: [] },
    },
    research: { author_ids: {} },
  };
}

describe("formatListHcpForDisplay", () => {
  it("should_list_doctors_when_items_present", () => {
    const items: TwinListItem[] = [
      {
        hcp_id: "hcp_a",
        name_zh: "侯凡凡",
        hospital: "南方医科大学南方医院",
        department: "肾内科",
        as_of: "2026-10-21",
        twin_version: 1,
        tags: null,
      },
    ];
    const text = formatListHcpForDisplay({ count: 1, items });
    expect(text).toContain("库里共有 1 位医生");
    expect(text).toContain("1. 侯凡凡 | 南方医科大学南方医院 | 肾内科");
    expect(text).toContain("编号 hcp_a");
    expect(text).not.toContain('{"count"');
  });

  it("should_show_empty_state_when_no_items", () => {
    const text = formatListHcpForDisplay({ count: 0, items: [] });
    expect(text).toContain("库里还没有任何医生档案。");
  });
});

describe("formatAddHcpSavedForDisplay", () => {
  it("should_show_saved_summary_when_add_hcp_saved", () => {
    const text = formatAddHcpSavedForDisplay({
      twin: sampleTwin(),
      hcp_id: "hcp_saved",
      refresh: { run_id: "run_1" },
      knowledge_jobs: [
        { specialty: "endocrinology", jobId: "job_1", knowledge_status: "ready" },
      ],
      specialty_preview: [
        { input: "内分泌科", specialty: "endocrinology", matched: true },
        { input: "未知词", specialty: null, matched: false },
      ],
    });
    expect(text).toContain("已保存新档案");
    expect(text).toContain("葛均波 | 复旦大学附属中山医院 | 内分泌科");
    expect(text).toContain("资料构建已开始");
    expect(text).toContain("endocrinology：已就绪");
    expect(text).toContain("内分泌科：将预灌对应专科知识库");
    expect(text).toContain("未知词：无法对应受控专科，将跳过知识预灌");
    expect(text).toContain("候选令牌已失效");
    expect(text).not.toContain('{"twin"');
  });
});

describe("formatDepartmentConfirmationForDisplay", () => {
  it("should_explain_next_step_when_department_confirmation_required", () => {
    const text = formatDepartmentConfirmationForDisplay({
      status: "department_confirmation_required",
      department_mismatch: { input_side: "neurology", signal_side: "endocrinology" },
      repair_hint: "人工核对后重试并传 confirm_department_checked: true",
    });
    expect(text).toContain("未保存");
    expect(text).toContain("你填的科室：neurology");
    expect(text).toContain("公开数据推断的科室：endocrinology");
    expect(text).toContain("下一步：人工核对后重试");
  });
});

describe("formatDuplicateConfirmationForDisplay", () => {
  it("should_list_duplicates_when_duplicate_confirmation_required", () => {
    const text = formatDuplicateConfirmationForDisplay({
      status: "confirmation_required",
      possible_duplicates: [
        {
          hcp_id: "hcp_dup",
          name_zh: "葛均波",
          hospital: "复旦大学附属中山医院",
          department: "心内科",
        },
      ],
      truncated: false,
    });
    expect(text).toContain("未保存");
    expect(text).toContain("疑似同一个人的档案");
    expect(text).toContain("1. 葛均波 | 复旦大学附属中山医院 | 心内科");
    expect(text).toContain("confirm_not_duplicate: true");
  });
});
