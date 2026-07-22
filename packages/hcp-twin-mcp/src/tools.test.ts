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
    expect(r.data.candidates.length).toBeGreaterThan(0);
    const primary = r.data.candidates[0];
    expect(primary?.name_zh).toBe("朱同玉");
    expect(primary?.hospital).toContain("中山");
    expect(primary?.hcpId).toBe(ZHU_HCP_ID);
    expect(primary?.evidence.some((e) => e.kind.includes("专家页") || e.kind === "OpenAlex")).toBe(
      true,
    );
    // 网页名不得冒充人选主字段
    expect(primary?.name_zh).not.toMatch(/专家页|OpenAlex|Author/i);
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
    const saved = await confirmAndSaveTwin(store, ZHU_HCP_ID);
    expect(saved.ok).toBe(true);

    const twin = await getTwinTool(store, { hcpId: ZHU_HCP_ID });
    expect(twin.ok).toBe(true);
    if (!twin.ok) return;
    const body = twin.data as {
      profile: { tags: { hcp_tier: string } };
      research: { author_ids: object };
    };
    expect(body.profile.tags.hcp_tier).toBe("T1");

    const insights = await getInsightsTool(store, { hcpId: ZHU_HCP_ID });
    expect(insights.ok).toBe(true);

    const tagged = await tagHcpTool(store, {
      hcpId: ZHU_HCP_ID,
      override: { hcp_tier: "T2", role_tags: ["kol"] },
    });
    expect(tagged.ok).toBe(true);
    if (!tagged.ok) return;
    const tags = (tagged.data as { tags: { tag_method: string; hcp_tier: string } })
      .tags;
    expect(tags.tag_method).toBe("user_override");
    expect(tags.hcp_tier).toBe("T2");

    // user_override preserved unless force_rule
    const again = await tagHcpTool(store, { hcpId: ZHU_HCP_ID });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(
      (again.data as { tags: { tag_method: string; hcp_tier: string } }).tags
        .hcp_tier,
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
  });

  it("葛均波 + 中山医院 不得返回朱同玉", async () => {
    const r = await resolveHcpIdentity(store, {
      name: "葛均波",
      hospital: "复旦大学附属中山医院",
      dept: "心内科",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.candidates.length).toBeGreaterThan(0);
    expect(r.data.candidates.every((c) => c.name_zh === "葛均波")).toBe(true);
    expect(r.data.candidates.some((c) => c.name_zh.includes("朱"))).toBe(false);
    expect(r.data.candidates[0]?.hcpId).not.toBe(ZHU_HCP_ID);
  });

  it("confirm non-fixture persists queried identity", async () => {
    const resolved = await resolveHcpIdentity(store, {
      name: "葛均波",
      hospital: "复旦大学附属中山医院",
      dept: "心内科",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const c = resolved.data.candidates[0]!;
    const saved = await confirmAndSaveTwin(store, {
      hcpId: c.hcpId!,
      name_zh: c.name_zh,
      hospital: c.hospital,
      department: c.department,
      title: c.title,
      tags_draft: c.tags_draft
        ? { hcp_tier: c.tags_draft.hcp_tier, role_tags: c.tags_draft.role_tags }
        : undefined,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const twin = await getTwinTool(store, { hcpId: saved.data.hcpId });
    expect(twin.ok).toBe(true);
    if (!twin.ok) return;
    const body = twin.data as { profile: { name_zh: string; hospital: string } };
    expect(body.profile.name_zh).toBe("葛均波");
    expect(body.profile.hospital).toContain("中山");
  });

  it("confirm merge openalex_ids writes primary + aliases (kol_20 shape)", async () => {
    const primary = "A5087829646";
    const alias = "A5087830123";
    const hcpId = `hcp_${primary.toLowerCase()}`;
    const saved = await confirmAndSaveTwin(store, {
      hcpId,
      name_zh: "张文宏",
      name_en: "Wenhong Zhang",
      hospital: "复旦大学附属华山医院",
      department: "感染科",
      city: "上海",
      openalex_ids: [primary, alias, primary],
      author_ids_draft: {
        openalex: primary,
        orcid: null,
      },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const twin = await getTwinTool(store, { hcpId: saved.data.hcpId });
    expect(twin.ok).toBe(true);
    if (!twin.ok) return;
    const body = twin.data as {
      research?: { author_ids?: { openalex?: string; openalex_aliases?: string[] } };
      profile?: { external_ids?: { openalex?: string; openalex_aliases?: string[] } };
    };
    expect(body.research?.author_ids?.openalex).toBe(primary);
    expect(body.research?.author_ids?.openalex_aliases).toEqual([alias]);
    expect(body.profile?.external_ids?.openalex_aliases).toEqual([alias]);
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
