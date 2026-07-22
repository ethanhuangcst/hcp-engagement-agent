import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const end = vi.fn();

vi.mock("pg", () => {
  class Pool {
    query = query;
    end = end;
  }
  return { default: { Pool } };
});

import {
  AGENT_GENERAL_HCP_ID,
  _resetPoolForTests,
  getInsights,
  getTwin,
  listTwins,
  pingDatabase,
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

describe("@hca/db with mocked pg", () => {
  beforeEach(() => {
    query.mockReset();
    end.mockReset();
    _resetPoolForTests();
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/hca";
  });

  it("pingDatabase true/false", async () => {
    query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    expect(await pingDatabase()).toBe(true);
    query.mockRejectedValueOnce(new Error("down"));
    expect(await pingDatabase()).toBe(false);
  });

  it("upsertTwin / getTwin / deleteTwin / listTwins / insights / tags", async () => {
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    const twin = await upsertTwin(sampleTwin());
    expect(twin.meta.hcp_id).toBe("hcp_test");

    query.mockResolvedValueOnce({ rows: [{ twin: sampleTwin() }] });
    const got = await getTwin("hcp_test");
    expect(got?.meta.hcp_id).toBe("hcp_test");

    query.mockResolvedValueOnce({ rows: [] });
    expect(await getTwin("missing")).toBeNull();

    query.mockResolvedValueOnce({
      rows: [
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
    });
    const list = await listTwins();
    expect(list[0]?.doing_now).toBe("洞察");
    const listSql = String(query.mock.calls.at(-1)?.[0] ?? "");
    expect(listSql).toContain("WHERE t.hcp_id <>");
    expect(query.mock.calls.at(-1)?.[1]).toEqual([AGENT_GENERAL_HCP_ID]);

    query.mockResolvedValue({ rows: [], rowCount: 1 });
    await upsertInsights({
      hcp_id: "hcp_test",
      as_of: "2026-07-17",
      doing_now: { summary: "x", as_of: "2026-07-17" },
    });

    query.mockResolvedValueOnce({
      rows: [
        {
          payload: {
            hcp_id: "hcp_test",
            as_of: "2026-07-17",
            doing_now: { summary: "x", as_of: "2026-07-17" },
          },
        },
      ],
    });
    expect((await getInsights("hcp_test"))?.doing_now?.summary).toBe("x");

    query.mockResolvedValueOnce({ rows: [] });
    expect(await getInsights("missing")).toBeNull();

    query
      .mockResolvedValueOnce({ rows: [{ twin: sampleTwin() }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const tagged = await updateTwinTags("hcp_test", {
      hcp_tier: "T2",
      role_tags: ["frontline"],
    });
    expect(tagged?.profile.tags?.hcp_tier).toBe("T2");

    query.mockResolvedValueOnce({ rows: [] });
    expect(await updateTwinTags("missing", { hcp_tier: "T3", role_tags: [] })).toBeNull();

    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await deleteTwin("hcp_test")).toBe(true);

    expect(await deleteTwin(AGENT_GENERAL_HCP_ID)).toBe(false);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM hcp_twins"),
      [AGENT_GENERAL_HCP_ID],
    );
  });
});
