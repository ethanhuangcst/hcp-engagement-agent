import {
  SCHEMA_VERSION,
  type AuthorIds,
  type HcpInsights,
  type HcpTags,
  type VirtualTwin,
} from "@hca/domain";

/** Stable fixture hcpId for 朱同玉 (MVP-1 mock / seed). */
export const ZHU_HCP_ID = "hcp_zhu_tongyu_zs";

export const ZHU_AUTHOR_IDS: AuthorIds = {
  orcid: null,
  pubmed_author: null,
  /** 肾移植 / Tongyu Zhu（非 A5040172093=Austin S. Ankney 核物理误绑） */
  openalex: "A5101900734",
  google_scholar: "Yby_S-sAAAAJ",
  scopus_author_id: null,
  cnki_scholar: null,
};

export const ZHU_TAGS: HcpTags = {
  hcp_tier: "T1",
  role_tags: ["kol", "kme", "administrator", "policy_voice"],
  tag_confidence: "high",
  tag_as_of: "2026-07-17",
  tag_method: "rule",
  evidence_refs: ["profile.title", "career.society_roles"],
};

export function buildZhuTongyuTwin(asOf = "2026-07-17"): VirtualTwin {
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
      role_labels: ["kol", "kme", "administrator", "policy_voice"],
      external_ids: ZHU_AUTHOR_IDS,
      tags: ZHU_TAGS,
    },
    career: {
      positions_current: [
        {
          title: "主任医师",
          org: "复旦大学附属中山医院",
          as_of: asOf,
          confidence: "high",
          source_url: "https://www.zs-hospital.sh.cn/",
          source_type: "hospital_page",
        },
      ],
    },
    research: {
      author_ids: ZHU_AUTHOR_IDS,
      themes: ["肾移植", "噬菌体", "BK病毒"],
    },
  };
}

/** Stage-E style skeleton: no final doing_now.summary (Agent owns display copy). */
export function buildZhuTongyuInsights(asOf = "2026-07-17"): HcpInsights {
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
