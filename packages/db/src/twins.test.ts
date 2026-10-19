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
  AGENT_GENERAL_HCP_ID,
  _resetPoolForTests,
  filtersMatch,
  getInsights,
  getPool,
  getTwin,
  listTwins,
  nameMatches,
  nameMatchTier,
  pingDatabase,
  queryTwins,
  upsertInsights,
  upsertTwin,
  updateTwinTags,
  deleteTwin,
} from "./index.js";
import { SCHEMA_VERSION, type VirtualTwin } from "@hca/domain";

function sampleTwin(id = "hcp_test"): VirtualTwin {
  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      hcp_id: id,
      as_of: "2026-07-17",
      twin_version: 1,
    },
    profile: {
      name_zh: "测试",
      hospital: "医院",
      department: "科室",
      disambiguation_status: "resolved",
      specialties: ["肾移植"],
      external_ids: { openalex: "A1" },
      tags: { hcp_tier: "T1", role_tags: ["kol"] },
    },
    research: { author_ids: { openalex: "A1" } },
  };
}

describe("queryTwins helpers", () => {
  const identity = {
    name_zh: "朱同玉",
    name_en: "Tongyu Zhu",
    hospital: "复旦大学附属中山医院",
    department: "肝外科",
    city: "上海",
  };

  it("should_match_name_zh_en_and_pinyin_when_nameMatches", () => {
    expect(nameMatches("朱同玉", identity)).toBe(true);
    expect(nameMatches("tongyu zhu", identity)).toBe(true);
    expect(nameMatches("zhutongyu", identity)).toBe(true);
    expect(nameMatches("不存在", identity)).toBe(false);
  });

  it("should_apply_optional_filters_when_filtersMatch", () => {
    expect(filtersMatch(identity, { hospital: "复旦大学附属中山医院" })).toBe(true);
    expect(filtersMatch(identity, { hospital: "其他医院" })).toBe(false);
    expect(filtersMatch(identity, {})).toBe(true);
  });

  it("should_match_given_name_first_latin_when_nameMatchTier", () => {
    const wang = { name_zh: "王长希", hospital: "中山医院", department: "器官移植科" };
    expect(nameMatchTier("changxi wang", wang)).toBe(1);
    expect(nameMatches("changxi wang", wang)).toBe(true);
  });

  it("should_match_one_edit_latin_full_name_when_nameMatchTier", () => {
    const han = {
      name_zh: "韩雅玲",
      name_en: "Yaling Han",
      hospital: "北部战区总医院",
      department: "心血管内科",
    };
    expect(nameMatchTier("yalin han", han)).toBe(2);
    expect(nameMatches("yalin han", han)).toBe(true);
  });

  it("should_not_fuzzy_match_short_latin_when_nameMatchTier", () => {
    const han = {
      name_zh: "韩雅玲",
      name_en: "Yaling Han",
      hospital: "北部战区总医院",
      department: "心血管内科",
    };
    expect(nameMatchTier("han", han)).toBe(null);
  });

  it("should_not_match_when_edit_distance_at_least_two", () => {
    const han = {
      name_zh: "韩雅玲",
      name_en: "Yaling Han",
      hospital: "北部战区总医院",
      department: "心血管内科",
    };
    expect(nameMatchTier("abcdefgh", han)).toBe(null);
  });

  const zhang = {
    name_zh: "张文宏",
    name_en: "Wenhong Zhang",
    hospital: "复旦大学附属华山医院",
    department: "感染科",
  };

  it("should_match_comma_last_first_when_nameMatchTier", () => {
    const enAnchor = {
      name_zh: "占位",
      name_en: "Wenhong Zhang",
      hospital: "医院",
      department: "科室",
    };
    expect(nameMatchTier("zhang, wenhong", enAnchor)).toBe(1);
    expect(nameMatchTier("zhang，wenhong", enAnchor)).toBe(1);
    expect(nameMatches("zhang, wenhong", zhang)).toBe(true);
  });

  it("should_not_reverse_when_comma_has_no_second_part", () => {
    expect(nameMatchTier("zhang,", zhang)).toBe(null);
  });

  it("should_match_hyphen_stripped_when_nameMatchTier", () => {
    expect(nameMatchTier("Wen-hong Zhang", zhang)).toBe(0);
  });

  it("should_match_apostrophe_stripped_when_nameMatchTier", () => {
    const obrien = {
      name_zh: "测试",
      name_en: "OBrien",
      hospital: "医院",
      department: "科室",
    };
    expect(nameMatchTier("O'Brien", obrien)).toBe(0);
    expect(nameMatchTier("O\u2019Brien", obrien)).toBe(0);
  });

  it("should_match_leading_title_stripped_when_nameMatchTier", () => {
    const han = {
      name_zh: "韩雅玲",
      name_en: "Yaling Han",
      hospital: "北部战区总医院",
      department: "心血管内科",
    };
    expect(nameMatchTier("Dr. Yaling Han", han)).toBe(0);
    expect(nameMatchTier("Prof. Wenhong Zhang", zhang)).toBe(0);
  });

  it("should_match_one_edit_after_comma_reverse_when_nameMatchTier", () => {
    expect(nameMatchTier("zhang, wenhon", zhang)).toBe(2);
  });

  it("should_not_match_abbreviation_or_trailing_title", () => {
    const han = {
      name_zh: "韩雅玲",
      name_en: "Yaling Han",
      hospital: "北部战区总医院",
      department: "心血管内科",
    };
    expect(nameMatchTier("Y. Han", han)).toBe(null);
    expect(nameMatchTier("Yaling Han, MD", han)).toBe(null);
    expect(nameMatchTier("Dr.Yaling", han)).toBe(null);
  });
});

describe("@hca/db with mocked mysql2", () => {
  beforeEach(() => {
    query.mockReset();
    end.mockReset();
    _resetPoolForTests();
    process.env.DATABASE_URL = "mysql://u:p@localhost:3306/hca";
  });

  it("should_reject_non_mysql_url_when_getPool", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/hca";
    expect(() => getPool()).toThrow(/mysql/);
  });

  it("should_ping_database_when_mysql_ok_or_down", async () => {
    query.mockResolvedValueOnce([[{ ok: 1 }], []]);
    expect(await pingDatabase()).toBe(true);
    query.mockRejectedValueOnce(new Error("down"));
    expect(await pingDatabase()).toBe(false);
  });

  it("should_upsert_get_delete_list_insights_and_tags_when_mysql2_pool", async () => {
    query.mockResolvedValue([{ affectedRows: 1 }, []]);
    const twin = await upsertTwin(sampleTwin());
    expect(twin.meta.hcp_id).toBe("hcp_test");
    const upsertSql = String(query.mock.calls[0]?.[0] ?? "");
    expect(upsertSql).toContain("ON DUPLICATE KEY UPDATE");
    expect(upsertSql).not.toContain("$1");
    expect(upsertSql).not.toContain("::jsonb");

    query.mockResolvedValueOnce([[{ twin: sampleTwin() }], []]);
    const got = await getTwin("hcp_test");
    expect(got?.meta.hcp_id).toBe("hcp_test");

    query.mockResolvedValueOnce([[], []]);
    expect(await getTwin("missing")).toBeNull();

    query.mockResolvedValueOnce([
      [
        {
          hcp_id: "hcp_test",
          identity: {
            name_zh: "测试",
            hospital: "医院",
            department: "科室",
          },
          tags: { hcp_tier: "T1", role_tags: [] },
          as_of: "2026-07-17",
          twin_version: 1,
          doing_now: "洞察",
        },
      ],
      [],
    ]);
    const list = await listTwins();
    expect(list[0]?.doing_now).toBe("洞察");
    const listSql = String(query.mock.calls.at(-1)?.[0] ?? "");
    expect(listSql).toContain("WHERE t.hcp_id <>");
    expect(listSql).toContain("JSON_UNQUOTE(JSON_EXTRACT");
    expect(query.mock.calls.at(-1)?.[1]).toEqual([AGENT_GENERAL_HCP_ID]);

    query.mockResolvedValue([{ affectedRows: 1 }, []]);
    await upsertInsights({
      hcp_id: "hcp_test",
      as_of: "2026-07-17",
      doing_now: { summary: "x", as_of: "2026-07-17" },
    });

    query.mockResolvedValueOnce([
      [
        {
          payload: {
            hcp_id: "hcp_test",
            as_of: "2026-07-17",
            doing_now: { summary: "x", as_of: "2026-07-17" },
          },
        },
      ],
      [],
    ]);
    expect((await getInsights("hcp_test"))?.doing_now?.summary).toBe("x");

    query.mockResolvedValueOnce([[], []]);
    expect(await getInsights("missing")).toBeNull();

    query
      .mockResolvedValueOnce([[{ twin: sampleTwin() }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const tagged = await updateTwinTags("hcp_test", {
      hcp_tier: "T2",
      role_tags: ["frontline"],
    });
    expect(tagged?.profile.tags?.hcp_tier).toBe("T2");

    query.mockResolvedValueOnce([[], []]);
    expect(await updateTwinTags("missing", { hcp_tier: "T3", role_tags: [] })).toBeNull();

    query.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    expect(await deleteTwin("hcp_test")).toBe(true);

    expect(await deleteTwin(AGENT_GENERAL_HCP_ID)).toBe(false);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM hcp_twins"),
      [AGENT_GENERAL_HCP_ID],
    );
  });

  it("should_parse_json_string_columns_when_mysql2_returns_strings", async () => {
    query.mockResolvedValueOnce([[{ twin: JSON.stringify(sampleTwin()) }], []]);
    const got = await getTwin("hcp_test");
    expect(got?.meta.hcp_id).toBe("hcp_test");
  });

  it("should_return_not_found_when_queryTwins_by_missing_hcp_id", async () => {
    query.mockResolvedValueOnce([[], []]);
    expect(await queryTwins({ hcp_id: "hcp_missing" })).toEqual({ found: false });
  });

  it("should_return_not_found_when_queryTwins_by_agent_general", async () => {
    expect(await queryTwins({ hcp_id: AGENT_GENERAL_HCP_ID })).toEqual({
      found: false,
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("should_return_empty_items_when_hcp_id_filters_mismatch", async () => {
    query.mockResolvedValueOnce([[{ twin: sampleTwin("hcp_a") }], []]);
    const r = await queryTwins({
      hcp_id: "hcp_a",
      hospital: "不匹配医院",
    });
    expect(r).toEqual({ found: true, items: [] });
  });

  it("should_sort_exact_before_fuzzy_edit_when_queryTwins_by_name", async () => {
    const exactTwin = sampleTwin("hcp_exact");
    exactTwin.profile.name_zh = "韩雅玲";
    exactTwin.identity = {
      name_zh: "韩雅玲",
      name_en: "Yalin Han",
      hospital: "A",
      department: "B",
    };
    const fuzzyTwin = sampleTwin("hcp_fuzzy");
    fuzzyTwin.profile.name_zh = "韩雅玲";
    fuzzyTwin.identity = {
      name_zh: "韩雅玲",
      name_en: "Yaling Han",
      hospital: "A",
      department: "B",
    };
    query.mockResolvedValueOnce([
      [
        { twin: fuzzyTwin, identity: fuzzyTwin.identity! },
        { twin: exactTwin, identity: exactTwin.identity! },
      ],
      [],
    ]);
    const r = await queryTwins({ name: "yalin han" });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.items.map((t) => t.meta.hcp_id)).toEqual(["hcp_exact", "hcp_fuzzy"]);
    }
  });

  it("should_return_multiple_items_when_queryTwins_by_name", async () => {
    const t1 = sampleTwin("hcp_a");
    t1.profile.name_zh = "朱同玉";
    const t2 = sampleTwin("hcp_b");
    t2.profile.name_zh = "朱同玉";
    t2.identity = {
      name_zh: "朱同玉",
      hospital: "其他医院",
      department: "科室",
    };
    query.mockResolvedValueOnce([
      [
        {
          twin: t1,
          identity: JSON.stringify({
            name_zh: "朱同玉",
            hospital: t1.profile.hospital,
            department: t1.profile.department,
          }),
        },
        {
          twin: t2,
          identity: t2.identity!,
        },
      ],
      [],
    ]);
    const r = await queryTwins({ name: "朱同玉" });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.items).toHaveLength(2);
    }
    const nameSql = String(query.mock.calls.at(-1)?.[0] ?? "");
    expect(nameSql).not.toContain("$1");
  });
});
