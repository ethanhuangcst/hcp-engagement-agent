import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "./store.js";
import {
  confirmAndSaveTwin,
  getInsightsTool,
  getTwinTool,
  healthCheckTool,
  resolveHcpIdentity,
  tagHcpTool,
  ZHU_HCP_ID,
} from "./tools.js";
import { assertAuthorIdsForLiteratureIngest } from "@hca/domain";
import { buildZhuTongyuTwin } from "./fixtures/zhu-tongyu.js";

describe("MVP-1 MCP tool contracts (TWIN_MODE=mock)", () => {
  const store = createMemoryStore();

  beforeEach(() => {
    store.clear?.();
  });

  it("resolve returns candidates without persisting Twin", async () => {
    const r = await resolveHcpIdentity(store, {
      name: "朱同玉",
      hospital: "复旦大学附属中山医院",
      dept: "肾脏移植科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.persisted).toBe(false);
    expect(r.data.url_candidates.length).toBeGreaterThan(0);
    expect(r.data.hcpId).toBe(ZHU_HCP_ID);
    expect(await store.getTwin(ZHU_HCP_ID)).toBeNull();
  });

  it("resolve validation error → MCP_ERROR", async () => {
    const r = await resolveHcpIdentity(store, { name: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("VALIDATION_ERROR");
  });

  it("get_twin NOT_FOUND before confirm", async () => {
    const r = await getTwinTool(store, { hcpId: ZHU_HCP_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("NOT_FOUND");
  });

  it("confirm → get_twin / get_insights / tag_hcp happy path", async () => {
    await confirmAndSaveTwin(store, ZHU_HCP_ID);

    const twin = await getTwinTool(store, { hcpId: ZHU_HCP_ID });
    expect(twin.ok).toBe(true);
    if (!twin.ok) return;
    const body = twin.data as { profile: { tags: { hcp_tier: string } }; research: { author_ids: object } };
    expect(body.profile.tags.hcp_tier).toBe("T1");

    const insights = await getInsightsTool(store, { hcpId: ZHU_HCP_ID });
    expect(insights.ok).toBe(true);

    const tagged = await tagHcpTool(store, {
      hcpId: ZHU_HCP_ID,
      override: { hcp_tier: "T2", role_tags: ["kol"] },
    });
    expect(tagged.ok).toBe(true);
    if (!tagged.ok) return;
    const tags = (tagged.data as { tags: { tag_method: string; hcp_tier: string } }).tags;
    expect(tags.tag_method).toBe("user_override");
    expect(tags.hcp_tier).toBe("T2");

    // user_override preserved unless force_rule
    const again = await tagHcpTool(store, { hcpId: ZHU_HCP_ID });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(
      (again.data as { tags: { tag_method: string; hcp_tier: string } }).tags.hcp_tier,
    ).toBe("T2");

    const forced = await tagHcpTool(store, {
      hcpId: ZHU_HCP_ID,
      force_rule: true,
    });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(
      (forced.data as { tags: { tag_method: string } }).tags.tag_method,
    ).toBe("rule");
  });

  it("health_check reports mock mode", async () => {
    const r = await healthCheckTool(store, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.twin_mode).toBe("mock");
    expect(r.data.database_ok).toBe(true);
    expect(r.data.playwright).toBe("skip");
  });

  it("resolve unresolved / empty match paths", async () => {
    const empty = await resolveHcpIdentity(store, {
      name: "无此人",
      hospital: "某医院",
      dept: "内科",
    });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.data.disambiguation_status).toBe("unresolved");

    const other = await resolveHcpIdentity(store, {
      name: "张三",
      hospital: "其他医院",
      dept: "内科",
    });
    expect(other.ok).toBe(true);
    if (other.ok) expect(other.data.url_candidates).toEqual([]);
  });

  it("get_insights / tag validation errors", async () => {
    const badInsights = await getInsightsTool(store, {});
    expect(badInsights.ok).toBe(false);
    const badTag = await tagHcpTool(store, { hcpId: "" });
    expect(badTag.ok).toBe(false);
    const missingTag = await tagHcpTool(store, { hcpId: "nope" });
    expect(missingTag.ok).toBe(false);
    if (!missingTag.ok) expect(missingTag.error.code).toBe("NOT_FOUND");
  });

  it("A9 literature gate on fixture twin", () => {
    const twin = buildZhuTongyuTwin();
    const gate = assertAuthorIdsForLiteratureIngest(
      twin.profile.disambiguation_status,
      twin.research?.author_ids,
    );
    expect(gate).toEqual({ ok: true });
  });
});
