import { SCHEMA_VERSION, type HcpInsights, type VirtualTwin } from "@hca/domain";

export const ZHU_HCP_ID = "hcp_zhu_tongyu_zs";

export function sampleZhuTwin(asOf = "2026-07-17"): VirtualTwin {
  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      hcp_id: ZHU_HCP_ID,
      as_of: asOf,
      twin_version: 1,
      build_mode: "full",
    },
    identity: {
      name_zh: "朱同玉",
      name_en: "Tongyu Zhu",
      hospital: "复旦大学附属中山医院",
      department: "肾脏移植科 / 泌尿外科",
      city: "上海",
      title: "主任医师 / 教授",
    },
    profile: {
      name_zh: "朱同玉",
      name_en: "Tongyu Zhu",
      hospital: "复旦大学附属中山医院",
      department: "肾脏移植科 / 泌尿外科",
      city: "上海",
      title: "主任医师 / 教授",
      disambiguation_status: "resolved",
      specialties: ["肾移植", "泌尿外科"],
      external_ids: { openalex: "A5101900734" },
      tags: {
        hcp_tier: "T1",
        role_tags: ["kol", "kme", "administrator"],
        tag_method: "rule",
        tag_as_of: asOf,
      },
    },
    research: {
      author_ids: { openalex: "A5101900734" },
      themes: ["肾移植", "噬菌体", "BK病毒"],
    },
  };
}

/** Insights skeleton without final doing_now.summary (Agent owns display copy). */
export function sampleZhuInsights(asOf = "2026-07-17"): HcpInsights {
  return {
    hcp_id: ZHU_HCP_ID,
    as_of: asOf,
    interest_directions: [
      { title: "噬菌体治疗", confidence: "medium" },
      { title: "移植后感染管理", confidence: "high" },
    ],
    opportunities: [
      {
        title: "学术会议讲者",
        priority: "high",
        note: "不假设处方或进院意愿",
      },
    ],
  };
}
