import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SCHEMA_VERSION, type VirtualTwin, type HcpInsights, type DoingNow } from "@hca/domain";
import { AGENT_GENERAL_HCP_ID } from "@hca/db";
import type { EnsureDoingNowResult, RagChunk } from "@hca/hcp-engagement-agent";
import {
  CandidateStore,
  type CandidatePayload,
} from "./candidate-store.js";
import {
  createMcpServer,
  internalMcpUrl,
  SPRINT1_TOOLS,
  type AddHcpFn,
  type ListTwinsFn,
  type QueryTwinsFn,
  type ResolveCandidateInput,
  type ResolveIdentityFn,
  type TriggerBuildFn,
  type GetTwinFn,
  type GetInsightsFn,
  type EnsureDoingNowFn,
  type RetrieveAcademicFn,
  type TriggerIngestFn,
} from "./server.js";
import type {
  ConfirmAndSaveResult,
  TwinListItem,
} from "@hca/db";

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
      specialties: [],
      external_ids: { openalex: "A1" },
      tags: { hcp_tier: "T1", role_tags: [] },
    },
    research: { author_ids: { openalex: "A1" } },
  };
}

type Deps = {
  queryTwins?: QueryTwinsFn;
  listTwins?: ListTwinsFn;
  resolveIdentity?: ResolveIdentityFn;
  addHcp?: AddHcpFn;
  triggerBuild?: TriggerBuildFn;
  candidateStore?: CandidateStore;
  getTwin?: GetTwinFn;
  getInsights?: GetInsightsFn;
  ensureDoingNow?: EnsureDoingNowFn;
  retrieveAcademic?: RetrieveAcademicFn;
  triggerIngest?: TriggerIngestFn;
};

async function connect(deps?: Deps) {
  const server = createMcpServer(deps);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

function candidate(overrides?: Partial<ResolveCandidateInput>): ResolveCandidateInput {
  return {
    candidate_id: "c-src-1",
    name_zh: "张外源",
    name_en: "Waiyuan Zhang",
    hospital: "北京协和医院",
    department: "肝胆外科",
    distinguish: "OpenAlex 命中",
    match_note: "姓名与机构均对上",
    confidence: "medium",
    hcpId: "hcp_a5016669077",
    author_ids_draft: { openalex: "A5016669077", orcid: null },
    ...overrides,
  };
}

function candidatePayload(): CandidatePayload {
  return {
    hcp_id: "hcp_new",
    name_zh: "张外源",
    hospital: "北京协和医院",
    department: "肝胆外科",
    author_ids: { openalex: "A5016669077" },
  };
}

function savedResult(twinId = "hcp_new"): ConfirmAndSaveResult {
  return { status: "saved", twin: sampleTwin(twinId), hcp_id: twinId };
}

describe("internalMcpUrl（MCP_URL 归一化）", () => {
  it("should_append_mcp_path_when_url_has_no_path", () => {
    expect(internalMcpUrl("http://127.0.0.1:3200")).toBe("http://127.0.0.1:3200/mcp");
  });

  it("should_keep_explicit_mcp_path_and_full_url_unchanged", () => {
    expect(internalMcpUrl("http://127.0.0.1:3200/mcp")).toBe("http://127.0.0.1:3200/mcp");
    expect(internalMcpUrl("https://twins.example.com/api/mcp")).toBe(
      "https://twins.example.com/api/mcp",
    );
  });

  it("should_return_raw_value_when_url_is_invalid", () => {
    expect(internalMcpUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("hcp-engagement-mcp Sprint 1 骨架", () => {
  it("should_list_sprint1_tools_when_client_calls_tools_list", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of SPRINT1_TOOLS) {
      expect(names).toContain(expected);
    }
    await client.close();
  });

  it("should_match_input_schema_contract_when_inspected", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));

    const list = byName.get("list_hcp")!;
    expect(list.inputSchema.required ?? []).toEqual([]);
    expect(list.annotations?.readOnlyHint).toBe(true);

    const query = byName.get("query_hcp")!;
    const queryProps = Object.keys(query.inputSchema.properties ?? {});
    expect(queryProps).toEqual(
      expect.arrayContaining([
        "hcp_id",
        "name",
        "hospital",
        "department",
        "city",
        "include_external",
      ]),
    );
    expect(query.annotations?.readOnlyHint).toBe(true);
    expect(query.annotations?.openWorldHint).toBe(true);

    const add = byName.get("add_hcp")!;
    expect(add.inputSchema.required).toEqual(["candidate_id"]);
    const addProps = Object.keys(add.inputSchema.properties ?? {});
    expect(addProps).toEqual(
      expect.arrayContaining(["candidate_id", "confirm_not_duplicate"]),
    );
    expect(addProps).not.toContain("hcp_id");
    expect(addProps).not.toContain("name_zh");
    expect(addProps).not.toContain("author_ids_draft");
    expect(addProps).not.toContain("tags_draft");
    expect(add.annotations?.readOnlyHint).toBeFalsy();
    await client.close();
  });

  it("should_reject_empty_arguments_when_query_hcp_called", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "query_hcp", arguments: {} });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { error?: { code?: string } };
    expect(structured.error?.code).toBe("VALIDATION_ERROR");
    const text = (result.content as { text?: string }[] | undefined)
      ?.map((c) => c.text ?? "")
      .join("");
    expect(text ?? "").not.toContain("stack");
    await client.close();
  });

  it("should_return_count_and_items_when_query_hcp_hits", async () => {
    const twin = sampleTwin("hcp_hit");
    const mockQuery: QueryTwinsFn = async () => ({ found: true, items: [twin] });
    const client = await connect({ queryTwins: mockQuery });
    const result = await client.callTool({
      name: "query_hcp",
      arguments: { hcp_id: "hcp_hit" },
    });
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as { count?: number; items?: unknown[] };
    expect(body.count).toBe(1);
    expect(body.items).toHaveLength(1);
    await client.close();
  });

  it("should_return_not_found_when_query_hcp_id_missing", async () => {
    const mockQuery: QueryTwinsFn = async () => ({ found: false });
    const client = await connect({ queryTwins: mockQuery });
    const result = await client.callTool({
      name: "query_hcp",
      arguments: { hcp_id: "hcp_missing" },
    });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { error?: { code?: string } };
    expect(structured.error?.code).toBe("NOT_FOUND");
    await client.close();
  });

  it("should_return_count_equal_items_length_when_list_hcp_called", async () => {
    const items: TwinListItem[] = [
      {
        hcp_id: "hcp_a",
        name_zh: "甲",
        hospital: "医院A",
        department: "科室A",
        as_of: "2026-07-17",
        twin_version: 1,
        tags: { hcp_tier: "T1", role_tags: [] },
      },
      {
        hcp_id: "hcp_b",
        name_zh: "乙",
        hospital: "医院B",
        department: "科室B",
        as_of: null,
        twin_version: 2,
        tags: null,
      },
    ];
    const mockList: ListTwinsFn = async () => items;
    const client = await connect({ listTwins: mockList });
    const result = await client.callTool({ name: "list_hcp", arguments: {} });
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as { count?: number; items?: TwinListItem[] };
    expect(body.count).toBe(items.length);
    expect(body.items).toEqual(items);
    await client.close();
  });

  it("should_return_count_zero_when_list_hcp_empty", async () => {
    const mockList: ListTwinsFn = async () => [];
    const client = await connect({ listTwins: mockList });
    const result = await client.callTool({ name: "list_hcp", arguments: {} });
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as { count?: number; items?: unknown[] };
    expect(body.count).toBe(0);
    expect(body.items).toEqual([]);
    await client.close();
  });

  it("should_return_internal_error_when_list_hcp_fails_without_stack", async () => {
    const mockList: ListTwinsFn = async () => {
      throw new Error("connect ECONNREFUSED mysql://root:secret@10.0.0.1:3306/hca");
    };
    const client = await connect({ listTwins: mockList });
    const result = await client.callTool({ name: "list_hcp", arguments: {} });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { error?: { code?: string; message?: string } };
    expect(structured.error?.code).toBe("INTERNAL_ERROR");
    const text = (result.content as { text?: string }[] | undefined)
      ?.map((c) => c.text ?? "")
      .join("");
    expect(text ?? "").not.toContain("ECONNREFUSED");
    expect(text ?? "").not.toContain("10.0.0.1");
    await client.close();
  });
});

describe("OGT-1 query_hcp include_external（ADR-010）", () => {
  const baseQuery: QueryTwinsFn = async () => ({ found: true, items: [sampleTwin()] });

  it("should_return_external_block_with_candidate_ids_when_resolve_hits", async () => {
    const store = new CandidateStore();
    const resolve: ResolveIdentityFn = vi.fn(async () => [candidate()]);
    const client = await connect({
      queryTwins: baseQuery,
      resolveIdentity: resolve,
      candidateStore: store,
    });
    const result = await client.callTool({
      name: "query_hcp",
      arguments: {
        name: "张外源",
        hospital: "协和医院",
        department: "外科",
        include_external: true,
      },
    });
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      count?: number;
      external?: { count?: number; items?: { candidate_id?: string }[] };
    };
    expect(body.external?.count).toBe(1);
    const externalItem = body.external?.items?.[0];
    expect(externalItem?.candidate_id).toMatch(/^cand_/);
    expect(store.get(externalItem?.candidate_id ?? "")?.name_zh).toBe("张外源");
    await client.close();
  });

  it("should_degrade_without_error_when_resolve_fails", async () => {
    const resolve: ResolveIdentityFn = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED http://10.0.0.1:3200/mcp");
    });
    const client = await connect({ queryTwins: baseQuery, resolveIdentity: resolve });
    const result = await client.callTool({
      name: "query_hcp",
      arguments: {
        name: "测试",
        hospital: "医院",
        department: "科室",
        include_external: true,
      },
    });
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      count?: number;
      external?: { count?: number; notice?: string };
    };
    expect(body.count).toBe(1);
    expect(body.external?.count).toBe(0);
    expect(body.external?.notice).toBeTruthy();
    const text = (result.content as { text?: string }[] | undefined)
      ?.map((c) => c.text ?? "")
      .join("");
    expect(text ?? "").not.toContain("ECONNREFUSED");
    await client.close();
  });

  it("should_not_call_resolve_when_include_external_absent", async () => {
    const resolve = vi.fn(async () => [candidate()]);
    const client = await connect({ queryTwins: baseQuery, resolveIdentity: resolve });
    await client.callTool({
      name: "query_hcp",
      arguments: { name: "测试", hospital: "医院", department: "科室" },
    });
    expect(resolve).not.toHaveBeenCalled();
    await client.close();
  });

  it("should_skip_resolve_when_hospital_or_department_missing", async () => {
    const resolve = vi.fn(async () => [candidate()]);
    const client = await connect({ queryTwins: baseQuery, resolveIdentity: resolve });
    const result = await client.callTool({
      name: "query_hcp",
      arguments: { name: "测试", include_external: true },
    });
    expect(resolve).not.toHaveBeenCalled();
    const body = result.structuredContent as {
      external?: { count?: number; notice?: string };
    };
    expect(body.external?.count).toBe(0);
    expect(body.external?.notice).toBeTruthy();
    await client.close();
  });

  it("should_not_duplicate_library_hits_in_external_items", async () => {
    const libraryTwin = sampleTwin("hcp_lib");
    const samePerson: ResolveCandidateInput = {
      ...candidate(),
      hcpId: "hcp_lib",
      name_zh: "测试",
    };
    const resolve: ResolveIdentityFn = vi.fn(async () => [samePerson, candidate()]);
    const client = await connect({
      queryTwins: async () => ({ found: true, items: [libraryTwin] }),
      resolveIdentity: resolve,
    });
    const result = await client.callTool({
      name: "query_hcp",
      arguments: {
        name: "测试",
        hospital: "医院",
        department: "科室",
        include_external: true,
      },
    });
    const body = result.structuredContent as {
      external?: { count?: number; items?: { name_zh?: string }[] };
    };
    expect(body.external?.count).toBe(1);
    expect(body.external?.items?.[0]?.name_zh).toBe("张外源");
    await client.close();
  });
});

describe("OGT-1 add_hcp 候选令牌门（ADR-009 / ADR-010）", () => {
  function makeDeps(overrides?: {
    addHcp?: AddHcpFn;
    triggerBuild?: TriggerBuildFn;
    store?: CandidateStore;
  }): Deps & { store: CandidateStore } {
    const store = overrides?.store ?? new CandidateStore();
    return {
      store,
      candidateStore: store,
      addHcp: overrides?.addHcp ?? vi.fn(async () => savedResult()),
      triggerBuild:
        overrides?.triggerBuild ?? vi.fn(async () => ({ runId: "run_test_refresh" })),
    };
  }

  it("should_reject_without_candidate_id", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "add_hcp", arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as { text?: string }[] | undefined)
      ?.map((c) => c.text ?? "")
      .join("");
    expect(text ?? "").toContain("candidate_id");
    await client.close();
  });

  it("should_return_not_found_when_token_unknown", async () => {
    const deps = makeDeps();
    const client = await connect(deps);
    const result = await client.callTool({
      name: "add_hcp",
      arguments: { candidate_id: "cand_unknown" },
    });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as {
      error?: { code?: string; repair_hint?: string };
    };
    expect(structured.error?.code).toBe("NOT_FOUND");
    expect(structured.error?.repair_hint).toContain("query_hcp");
    expect(deps.addHcp).not.toHaveBeenCalled();
    await client.close();
  });

  it("should_save_via_injected_add_fn_when_token_valid", async () => {
    const deps = makeDeps();
    const token = deps.store.issue(candidatePayload());
    const client = await connect(deps);
    const result = await client.callTool({
      name: "add_hcp",
      arguments: { candidate_id: token },
    });
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as { twin?: VirtualTwin; hcp_id?: string };
    expect(body.hcp_id).toBe("hcp_new");
    expect(body.twin?.meta.hcp_id).toBe("hcp_new");
    expect(body).not.toHaveProperty("knowledge_jobs");
    const addCall = (deps.addHcp as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(addCall.name_zh).toBe("张外源");
    expect(addCall.hospital).toBe("北京协和医院");
    expect(addCall.author_ids.openalex).toBe("A5016669077");
    await client.close();
  });

  it("should_invalidate_token_after_success", async () => {
    const deps = makeDeps();
    const token = deps.store.issue(candidatePayload());
    const client = await connect(deps);
    await client.callTool({ name: "add_hcp", arguments: { candidate_id: token } });
    const second = await client.callTool({
      name: "add_hcp",
      arguments: { candidate_id: token },
    });
    expect(second.isError).toBe(true);
    const structured = second.structuredContent as { error?: { code?: string } };
    expect(structured.error?.code).toBe("NOT_FOUND");
    await client.close();
  });

  it("should_pass_confirm_not_duplicate_through_and_invalidate_after_write", async () => {
    const deps = makeDeps();
    const addMock = deps.addHcp as ReturnType<typeof vi.fn>;
    addMock.mockResolvedValueOnce({
      status: "confirmation_required",
      possible_duplicates: [
        {
          hcp_id: "hcp_dup",
          name_zh: "张外源",
          hospital: "上海中山医院",
          department: "肝外科",
          match_tier: 1,
        },
      ],
      truncated: false,
    });
    const token = deps.store.issue(candidatePayload());
    const client = await connect(deps);
    const first = await client.callTool({
      name: "add_hcp",
      arguments: { candidate_id: token },
    });
    expect(first.isError).not.toBe(true);
    const requiredBody = first.structuredContent as {
      status?: string;
      possible_duplicates?: unknown[];
    };
    expect(requiredBody.status).toBe("confirmation_required");
    expect(requiredBody.possible_duplicates).toHaveLength(1);
    expect(deps.store.get(token)).not.toBeNull();

    addMock.mockResolvedValueOnce(savedResult());
    const second = await client.callTool({
      name: "add_hcp",
      arguments: { candidate_id: token, confirm_not_duplicate: true },
    });
    expect(second.isError).not.toBe(true);
    const addCalls = addMock.mock.calls;
    expect(addCalls[1]![0]!.confirm_not_duplicate).toBe(true);
    expect(deps.store.get(token)).toBeNull();
    await client.close();
  });

  it("should_map_invalid_status_to_validation_error", async () => {
    const deps = makeDeps({
      addHcp: vi.fn((): Promise<ConfirmAndSaveResult> =>
        Promise.resolve({
          status: "invalid",
          code: "VALIDATION_ERROR",
          message: "编号已存在",
          repair_hint: "换用候选派生的 hcp_id",
        })),
      });
    const token = deps.store.issue(candidatePayload());
    const client = await connect(deps);
    const result = await client.callTool({
      name: "add_hcp",
      arguments: { candidate_id: token },
    });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { error?: { code?: string } };
    expect(structured.error?.code).toBe("VALIDATION_ERROR");
    expect(deps.store.get(token)).not.toBeNull();
    await client.close();
  });

  it("should_map_add_fn_throw_to_internal_error_without_secrets", async () => {
    const deps = makeDeps({
      addHcp: vi.fn(async () => {
        throw new Error("insert failed mysql://root:secret@10.0.0.1:3306/hca");
      }),
    });
    const token = deps.store.issue(candidatePayload());
    const client = await connect(deps);
    const result = await client.callTool({
      name: "add_hcp",
      arguments: { candidate_id: token },
    });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { error?: { code?: string } };
    expect(structured.error?.code).toBe("INTERNAL_ERROR");
    const text = (result.content as { text?: string }[] | undefined)
      ?.map((c) => c.text ?? "")
      .join("");
    expect(text ?? "").not.toContain("mysql://");
    expect(text ?? "").not.toContain("10.0.0.1");
    await client.close();
  });
});

describe("add_hcp ADR-013 异步刷新触发", () => {
  function makeDeps(overrides?: {
    addHcp?: AddHcpFn;
    triggerBuild?: TriggerBuildFn;
    store?: CandidateStore;
  }) {
    const store = overrides?.store ?? new CandidateStore();
    const addHcp = vi.fn(overrides?.addHcp ?? (async () => savedResult()));
    const triggerBuild = vi.fn(
      overrides?.triggerBuild ?? (async () => ({ runId: "run_test_refresh" })),
    );
    return { store, candidateStore: store, addHcp, triggerBuild };
  }

  it("should_return_refresh_run_id_when_trigger_succeeds", async () => {
    const deps = makeDeps();
    const token = deps.store.issue(candidatePayload());
    const client = await connect(deps);
    const result = await client.callTool({ name: "add_hcp", arguments: { candidate_id: token } });
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      hcp_id?: string;
      refresh?: { run_id?: string };
    };
    expect(body.hcp_id).toBe("hcp_new");
    expect(body.refresh?.run_id).toBe("run_test_refresh");
    expect(deps.triggerBuild).toHaveBeenCalledTimes(1);
    expect(deps.triggerBuild).toHaveBeenCalledWith({ hcpId: "hcp_new", mode: "incremental" });
    await client.close();
  });

  it("should_still_succeed_without_refresh_when_trigger_fails", async () => {
    const deps = makeDeps({
      triggerBuild: vi.fn(async () => {
        throw new Error("connect ECONNREFUSED http://127.0.0.1:3200/mcp");
      }),
    });
    const token = deps.store.issue(candidatePayload());
    const client = await connect(deps);
    const result = await client.callTool({ name: "add_hcp", arguments: { candidate_id: token } });
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      hcp_id?: string;
      refresh?: { run_id?: string };
    };
    expect(body.hcp_id).toBe("hcp_new");
    expect(body).not.toHaveProperty("refresh");
    const text = (result.content as { text?: string }[] | undefined)
      ?.map((c) => c.text ?? "")
      .join("");
    expect(text ?? "").not.toContain("ECONNREFUSED");
    await client.close();
  });

  it("should_not_trigger_when_confirmation_required", async () => {
    const deps = makeDeps({
      addHcp: vi.fn((): Promise<ConfirmAndSaveResult> =>
        Promise.resolve({
          status: "confirmation_required",
          possible_duplicates: [
            {
              hcp_id: "hcp_dup",
              name_zh: "张外源",
              hospital: "上海中山医院",
              department: "肝外科",
              match_tier: 1,
            },
          ],
          truncated: false,
        })),
    });
    const token = deps.store.issue(candidatePayload());
    const client = await connect(deps);
    const result = await client.callTool({ name: "add_hcp", arguments: { candidate_id: token } });
    expect(result.isError).not.toBe(true);
    expect(deps.triggerBuild).not.toHaveBeenCalled();
    const body = result.structuredContent as { status?: string };
    expect(body.status).toBe("confirmation_required");
    await client.close();
  });
});

describe("feature-01 get_hcp_insights（ADR-013）", () => {
  function sampleDoingNow(): DoingNow {
    return {
      summary: "正在关注肝癌术后辅助治疗的近期研究进展",
      as_of: "2026-10-21",
      confidence: "medium",
    };
  }

  function emptyInsights(): HcpInsights {
    return {
      hcp_id: "hcp_test",
      as_of: "2026-07-17",
      doing_now: undefined,
      interest_directions: [],
      opportunities: [],
      evidence: [],
    };
  }

  function insightsWithDoingNow(): HcpInsights {
    return { ...emptyInsights(), doing_now: sampleDoingNow() };
  }

  function makeDeps(overrides?: {
    getTwin?: GetTwinFn;
    getInsights?: GetInsightsFn;
    ensureDoingNow?: EnsureDoingNowFn;
  }) {
    const getTwin = vi.fn(overrides?.getTwin ?? (async () => sampleTwin()));
    const getInsights = vi.fn(
      overrides?.getInsights ?? (async () => insightsWithDoingNow()),
    );
    const ensureDoingNow = vi.fn(
      overrides?.ensureDoingNow ??
        (async (): Promise<EnsureDoingNowResult> => ({
          status: "ready",
          doing_now: sampleDoingNow(),
          reused: false,
        })),
    );
    return { getTwin, getInsights, ensureDoingNow };
  }

  async function callGetInsights(
    deps: Deps,
    hcpId = "hcp_test",
  ) {
    const client = await connect(deps);
    const result = await client.callTool({
      name: "get_hcp_insights",
      arguments: { hcp_id: hcpId },
    });
    await client.close();
    return result;
  }

  it("should_expose_tool_with_annotations_and_required_hcp_id_when_listed", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "get_hcp_insights");
    expect(tool).toBeDefined();
    expect(tool!.annotations?.readOnlyHint).toBe(false);
    expect(tool!.annotations?.openWorldHint).toBe(false);
    expect(tool!.inputSchema.required).toEqual(["hcp_id"]);
    await client.close();
  });

  it("should_reject_missing_hcp_id_at_schema_layer_without_error_envelope", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "get_hcp_insights",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as
      | { error?: unknown }
      | undefined;
    expect(structured?.error).toBeUndefined();
    await client.close();
  });

  it("should_return_pure_read_without_synthesized_when_doing_now_exists", async () => {
    const deps = makeDeps();
    const result = await callGetInsights(deps);
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      twin?: VirtualTwin;
      insights?: Record<string, unknown>;
    };
    expect(body.twin?.meta.hcp_id).toBe("hcp_test");
    expect((body.insights?.doing_now as DoingNow).summary).toContain("肝癌");
    expect("synthesized" in (body.insights ?? {})).toBe(false);
    expect("pending" in (body.insights ?? {})).toBe(false);
    expect(deps.ensureDoingNow).not.toHaveBeenCalled();
  });

  it("should_synthesize_and_return_ready_when_template_empty", async () => {
    const deps = makeDeps({
      getInsights: vi
        .fn<GetInsightsFn>()
        .mockResolvedValueOnce(emptyInsights())
        .mockResolvedValueOnce(insightsWithDoingNow()),
    });
    const result = await callGetInsights(deps);
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      insights?: Record<string, unknown>;
    };
    expect(body.insights?.synthesized).toBe(true);
    expect(deps.ensureDoingNow).toHaveBeenCalledTimes(1);
    expect(deps.ensureDoingNow).toHaveBeenCalledWith("hcp_test");
    expect(deps.getInsights).toHaveBeenCalledTimes(2);
  });

  it("should_return_pending_with_repair_hint_when_facts_insufficient", async () => {
    const deps = makeDeps({
      getInsights: vi.fn(async () => emptyInsights()),
      ensureDoingNow: vi.fn(
        async (): Promise<EnsureDoingNowResult> => ({
          status: "pending",
          reason: "insufficient_facts",
        }),
      ),
    });
    const result = await callGetInsights(deps);
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      insights?: Record<string, unknown>;
      error?: unknown;
    };
    expect(body.error).toBeUndefined();
    expect(body.insights?.pending).toBe(true);
    expect(typeof body.insights?.repair_hint).toBe("string");
    expect((body.insights?.repair_hint as string).length).toBeGreaterThan(0);
    expect(body.insights?.hcp_id).toBe("hcp_test");
  });

  it("should_return_pending_when_llm_unavailable", async () => {
    const deps = makeDeps({
      getInsights: vi.fn(async () => emptyInsights()),
      ensureDoingNow: vi.fn(
        async (): Promise<EnsureDoingNowResult> => ({
          status: "pending",
          reason: "llm_unavailable",
        }),
      ),
    });
    const result = await callGetInsights(deps);
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      insights?: Record<string, unknown>;
    };
    expect(body.insights?.pending).toBe(true);
  });

  it("should_treat_null_insights_as_empty_template_and_synthesize", async () => {
    const deps = makeDeps({
      getInsights: vi
        .fn<GetInsightsFn>()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(insightsWithDoingNow()),
    });
    const result = await callGetInsights(deps);
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      insights?: Record<string, unknown>;
    };
    expect(body.insights?.synthesized).toBe(true);
    expect(deps.ensureDoingNow).toHaveBeenCalledTimes(1);
  });

  it("should_return_not_found_when_twin_missing", async () => {
    const deps = makeDeps({ getTwin: vi.fn(async () => null) });
    const result = await callGetInsights(deps);
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as {
      error?: { code?: string };
    };
    expect(structured.error?.code).toBe("NOT_FOUND");
    expect(deps.ensureDoingNow).not.toHaveBeenCalled();
  });

  it("should_return_not_found_when_twin_is_agent_general", async () => {
    const generalTwin = sampleTwin(AGENT_GENERAL_HCP_ID);
    const deps = makeDeps({ getTwin: vi.fn(async () => generalTwin) });
    const result = await callGetInsights(deps);
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as {
      error?: { code?: string };
    };
    expect(structured.error?.code).toBe("NOT_FOUND");
  });

  it("should_return_internal_error_without_stack_or_connection_string_when_db_throws", async () => {
    const deps = makeDeps({
      getTwin: vi.fn(async () => {
        throw new Error(
          "postgres://user:secret@db.internal:5432/hca 连接失败",
        );
      }),
    });
    const result = await callGetInsights(deps);
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as {
      error?: { code?: string; message?: string };
    };
    expect(structured.error?.code).toBe("INTERNAL_ERROR");
    const text = (result.content as { text?: string }[] | undefined)
      ?.map((c) => c.text ?? "")
      .join("");
    expect(text ?? "").not.toContain("stack");
    expect(text ?? "").not.toContain("postgres://");
    expect(text ?? "").not.toContain("secret");
  });
});

describe("feature-02 retrieve_academic（ADR-012）", () => {
  function sampleChunk(overrides?: Partial<RagChunk>): RagChunk {
    return {
      id: "chunk_1",
      text: "肾移植术后 BK 病毒感染的管控要点……",
      score: 0.87,
      source: "公开文献",
      version: "v1",
      as_of: "2026-10-01",
      index: "academic",
      doi: "10.1000/fixture-doi",
      year: 2026,
      ...overrides,
    };
  }

  type AcademicDeps = {
    getTwin?: GetTwinFn;
    retrieveAcademic?: RetrieveAcademicFn;
  };

  function makeAcademicDeps(overrides?: AcademicDeps) {
    const getTwin = vi.fn(overrides?.getTwin ?? (async () => sampleTwin()));
    const retrieveAcademic = vi.fn(
      overrides?.retrieveAcademic ??
        (async (): Promise<{ chunks: RagChunk[] }> => ({
          chunks: [sampleChunk()],
        })),
    );
    return { getTwin, retrieveAcademic };
  }

  async function callAcademic(
    deps: Deps,
    args: Record<string, unknown>,
  ) {
    const client = await connect(deps);
    const result = await client.callTool({
      name: "retrieve_academic",
      arguments: args,
    });
    await client.close();
    return result;
  }

  it("should_expose_tool_with_annotations_and_required_hcp_id_when_listed", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "retrieve_academic");
    expect(tool).toBeDefined();
    expect(tool!.annotations?.readOnlyHint).toBe(true);
    expect(tool!.annotations?.openWorldHint).toBe(true);
    expect(tool!.inputSchema.required).toEqual(["hcp_id"]);
    await client.close();
  });

  it("should_pass_caller_query_specialty_themes_through_when_provided", async () => {
    const deps = makeAcademicDeps();
    const result = await callAcademic(deps, {
      hcp_id: "hcp_test",
      query: "BK virus management",
      specialty: "肾移植",
      themes: ["噬菌体", "BK病毒"],
    });
    expect(result.isError).not.toBe(true);
    expect(deps.retrieveAcademic).toHaveBeenCalledWith({
      query: "BK virus management",
      specialty: "肾移植",
      themes: ["噬菌体", "BK病毒"],
    });
  });

  it("should_derive_query_from_twin_themes_when_only_hcp_id_given", async () => {
    const twin = sampleTwin();
    twin.research = {
      ...twin.research,
      themes: ["肾移植", "噬菌体", "BK病毒", "免疫"],
    };
    twin.profile.specialties = ["肾移植", "泌尿外科"];
    const deps = makeAcademicDeps({ getTwin: vi.fn(async () => twin) });
    const result = await callAcademic(deps, { hcp_id: "hcp_test" });
    expect(result.isError).not.toBe(true);
    const call = deps.retrieveAcademic.mock.calls[0]?.[0] as {
      query?: string;
      specialty?: string;
    };
    expect(call.query).toBe("肾移植 噬菌体 BK病毒");
    expect(call.specialty).toBe("肾移植");
  });

  it("should_fall_back_to_name_query_when_twin_has_no_themes", async () => {
    const twin = sampleTwin();
    twin.research = { author_ids: { openalex: "A1" } };
    twin.profile.specialties = [];
    const deps = makeAcademicDeps({ getTwin: vi.fn(async () => twin) });
    const result = await callAcademic(deps, { hcp_id: "hcp_test" });
    expect(result.isError).not.toBe(true);
    const call = deps.retrieveAcademic.mock.calls[0]?.[0] as {
      query?: string;
    };
    expect(call.query).toBe("测试 学术交流");
  });

  it("should_return_chunks_unchanged_when_retrieval_succeeds", async () => {
    const deps = makeAcademicDeps();
    const result = await callAcademic(deps, {
      hcp_id: "hcp_test",
      query: "BK virus",
    });
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as { chunks?: RagChunk[] };
    const first = body.chunks?.[0];
    expect(body.chunks).toHaveLength(1);
    expect(first?.doi).toBe("10.1000/fixture-doi");
    expect(first?.score).toBeCloseTo(0.87);
  });

  it("should_return_not_found_when_twin_missing", async () => {
    const deps = makeAcademicDeps({ getTwin: vi.fn(async () => null) });
    const result = await callAcademic(deps, { hcp_id: "hcp_missing" });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as {
      error?: { code?: string };
    };
    expect(structured.error?.code).toBe("NOT_FOUND");
    expect(deps.retrieveAcademic).not.toHaveBeenCalled();
  });

  it("should_return_not_found_when_twin_is_agent_general", async () => {
    const generalTwin = sampleTwin(AGENT_GENERAL_HCP_ID);
    const deps = makeAcademicDeps({ getTwin: vi.fn(async () => generalTwin) });
    const result = await callAcademic(deps, { hcp_id: AGENT_GENERAL_HCP_ID });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as {
      error?: { code?: string };
    };
    expect(structured.error?.code).toBe("NOT_FOUND");
  });

  it("should_reject_missing_hcp_id_at_schema_layer_without_error_envelope", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "retrieve_academic",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as
      | { error?: unknown }
      | undefined;
    expect(structured?.error).toBeUndefined();
    await client.close();
  });

  it("should_return_internal_error_without_stack_or_connection_string_when_rag_throws", async () => {
    const deps = makeAcademicDeps({
      retrieveAcademic: vi.fn(async () => {
        throw new Error(
          "postgres://user:secret@qdrant.internal:6333 ECONNREFUSED",
        );
      }),
    });
    const result = await callAcademic(deps, {
      hcp_id: "hcp_test",
      query: "BK virus",
    });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as {
      error?: { code?: string; message?: string; repair_hint?: string };
    };
    expect(structured.error?.code).toBe("INTERNAL_ERROR");
    expect(structured.error?.repair_hint ?? "").toContain("知识库");
    const text = (result.content as { text?: string }[] | undefined)
      ?.map((c) => c.text ?? "")
      .join("");
    expect(text ?? "").not.toContain("stack");
    expect(text ?? "").not.toContain("postgres://");
    expect(text ?? "").not.toContain("secret");
  });
});

describe("feature-07 知识覆盖对齐（ADR-014）", () => {
  function twinWithControlledSpecialty(id = "hcp_new"): VirtualTwin {
    const twin = sampleTwin(id);
    twin.profile.department = "肾移植科";
    twin.profile.specialties = ["肾移植"];
    return twin;
  }

  function makePrefillDeps(overrides?: {
    twin?: VirtualTwin;
    triggerIngest?: TriggerIngestFn;
  }) {
    const triggerIngest =
      overrides?.triggerIngest ??
      (vi.fn(async () => [
        {
          specialty: "kidney_transplant",
          jobId: "job_prefill_1",
          knowledge_status: "ready" as const,
        },
      ]) as unknown as TriggerIngestFn);
    const twin = overrides?.twin ?? twinWithControlledSpecialty();
    const addHcp = vi.fn(
      async (): Promise<ConfirmAndSaveResult> => ({
        status: "saved",
        twin,
        hcp_id: twin.meta.hcp_id,
      }),
    );
    const store = new CandidateStore();
    return { store, addHcp, triggerIngest };
  }

  async function callAddHcp(deps: Deps, candidateId?: string) {
    const token = deps.candidateStore!.issue(candidatePayload());
    const client = await connect(deps);
    const result = await client.callTool({
      name: "add_hcp",
      arguments: { candidate_id: candidateId ?? token },
    });
    await client.close();
    return { result, token };
  }

  function sampleChunkF07(): RagChunk {
    return {
      id: "chunk_1",
      text: "肾移植术后 BK 病毒感染的管控要点……",
      score: 0.87,
      source: "公开文献",
      version: "v1",
      as_of: "2026-10-01",
      index: "academic",
      doi: "10.1000/fixture-doi",
      year: 2026,
    };
  }

  async function callAcademic(deps: Deps, args: Record<string, unknown>) {
    const client = await connect(deps);
    const result = await client.callTool({
      name: "retrieve_academic",
      arguments: args,
    });
    await client.close();
    return result;
  }

  it("should_fire_prefill_with_controlled_specialties_and_return_knowledge_jobs_when_saved", async () => {
    const { addHcp, triggerIngest, store } = makePrefillDeps();
    const deps: Deps = { candidateStore: store, addHcp, triggerIngest };
    const { result } = await callAddHcp(deps);
    expect(result.isError).not.toBe(true);
    expect(triggerIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        specialties: ["kidney_transplant"],
        department: "肾移植科",
        hcpId: "hcp_new",
      }),
    );
    const body = result.structuredContent as {
      knowledge_jobs?: {
        specialty?: string;
        jobId?: string;
        knowledge_status?: string;
      }[];
    };
    expect(body.knowledge_jobs?.[0]?.specialty).toBe("kidney_transplant");
    expect(body.knowledge_jobs?.[0]?.jobId).toBe("job_prefill_1");
  });

  it("should_keep_add_hcp_success_when_prefill_throws", async () => {
    const { addHcp, triggerIngest, store } = makePrefillDeps({
      triggerIngest: vi.fn(async () => {
        throw new Error("ingest queue down");
      }) as unknown as TriggerIngestFn,
    });
    const deps: Deps = { candidateStore: store, addHcp, triggerIngest };
    const { result } = await callAddHcp(deps);
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      hcp_id?: string;
      knowledge_jobs?: unknown;
    };
    expect(body.hcp_id).toBe("hcp_new");
    expect(body.knowledge_jobs).toBeUndefined();
  });

  it("should_skip_prefill_when_no_controlled_specialty_resolves", async () => {
    const { addHcp, triggerIngest, store } = makePrefillDeps({
      twin: sampleTwin(),
    });
    const deps: Deps = { candidateStore: store, addHcp, triggerIngest };
    const { result } = await callAddHcp(deps);
    expect(result.isError).not.toBe(true);
    expect(triggerIngest).not.toHaveBeenCalled();
    const body = result.structuredContent as {
      knowledge_jobs?: unknown;
    };
    expect(body.knowledge_jobs).toBeUndefined();
  });

  // —— MCP2-09 / DEF-005：候选科室字段透传 + specialty_preview 映射预览 ——

  it("should_pass_department_annotation_fields_through_external_items_and_cache", async () => {
    const baseQuery: QueryTwinsFn = async () => ({
      found: true,
      items: [sampleTwin()],
    });
    const store = new CandidateStore();
    const annotated = candidate({
      department_provenance: { origin: "caller_input", verified: false },
      department_signal: { topics: ["Psychiatry"], specialty: "psychiatry" },
      department_mismatch: {
        input_side: "neurology",
        signal_side: "psychiatry",
      },
    });
    const resolve: ResolveIdentityFn = vi.fn(async () => [annotated]);
    const client = await connect({
      queryTwins: baseQuery,
      resolveIdentity: resolve,
      candidateStore: store,
    });
    const result = await client.callTool({
      name: "query_hcp",
      arguments: {
        name: "张外源",
        hospital: "协和医院",
        department: "外科",
        include_external: true,
      },
    });
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      external?: {
        items?: {
          department_provenance?: unknown;
          department_signal?: unknown;
          department_mismatch?: unknown;
        }[];
      };
    };
    const item = body.external?.items?.[0]!;
    expect(item.department_provenance).toEqual({
      origin: "caller_input",
      verified: false,
    });
    expect(item.department_signal).toEqual({
      topics: ["Psychiatry"],
      specialty: "psychiatry",
    });
    expect(item.department_mismatch).toEqual({
      input_side: "neurology",
      signal_side: "psychiatry",
    });
    // 候选缓存保存新字段，add_hcp 确认时可回看
    const extBody = result.structuredContent as {
      external?: { items?: { candidate_id?: string }[] };
    };
    const cached = store.get(extBody.external?.items?.[0]?.candidate_id ?? "");
    expect(cached?.department_provenance).toEqual({
      origin: "caller_input",
      verified: false,
    });
    expect(cached?.department_signal?.specialty).toBe("psychiatry");
    expect(cached?.department_mismatch?.signal_side).toBe("psychiatry");
    await client.close();
  });

  it("should_return_specialty_preview_consistent_with_knowledge_jobs", async () => {
    const { addHcp, triggerIngest, store } = makePrefillDeps();
    const deps: Deps = { candidateStore: store, addHcp, triggerIngest };
    const { result } = await callAddHcp(deps);
    expect(result.isError).not.toBe(true);
    const body = result.structuredContent as {
      specialty_preview?: {
        input?: string;
        specialty?: string | null;
        matched?: boolean;
      }[];
      knowledge_jobs?: { specialty?: string }[];
    };
    const row = body.specialty_preview?.find(
      (r) => r.input === "肾移植科",
    );
    expect(row).toEqual({
      input: "肾移植科",
      specialty: "kidney_transplant",
      matched: true,
    });
    // 预览与实际预灌同源一致（mcp2-design §13.3）
    expect(body.knowledge_jobs?.[0]?.specialty).toBe("kidney_transplant");
  });

  it("should_show_unmatched_preview_row_with_hint_and_still_succeed", async () => {
    // twin 科室「科室」映射不到任何受控专科
    const { addHcp, triggerIngest, store } = makePrefillDeps({
      twin: sampleTwin("hcp_liver"),
    });
    const deps: Deps = { candidateStore: store, addHcp, triggerIngest };
    const { result } = await callAddHcp(deps);
    expect(result.isError).not.toBe(true);
    expect(triggerIngest).not.toHaveBeenCalled();
    const body = result.structuredContent as {
      hcp_id?: string;
      specialty_preview?: {
        input?: string;
        specialty?: string | null;
        matched?: boolean;
        hint?: string;
      }[];
      knowledge_jobs?: unknown;
    };
    expect(body.hcp_id).toBe("hcp_liver");
    expect(body.knowledge_jobs).toBeUndefined();
    const row = body.specialty_preview?.[0]!;
    expect(row.matched).toBe(false);
    expect(row.hint).toBeTruthy();
  });

  it("should_omit_specialty_preview_when_department_empty", async () => {
    const { addHcp, triggerIngest, store } = makePrefillDeps();
    const twin = sampleTwin("hcp_nodept");
    twin.profile.department = "";
    const addHcpEmpty = vi.fn(async (): Promise<ConfirmAndSaveResult> => ({
      status: "saved",
      twin,
      hcp_id: twin.meta.hcp_id,
    }));
    const deps: Deps = {
      candidateStore: store,
      addHcp: addHcpEmpty,
      triggerIngest,
    };
    const { result } = await callAddHcp(deps);
    expect(result.isError).not.toBe(true);
    expect(triggerIngest).not.toHaveBeenCalled();
    const body = result.structuredContent as {
      specialty_preview?: unknown;
    };
    expect(body.specialty_preview).toBeUndefined();
  });

  it("should_surface_sparse_coverage_with_repair_hint_on_retrieve_academic", async () => {
    const deps: Deps = {
      getTwin: vi.fn(async () => sampleTwin("hcp_test")),
      retrieveAcademic: vi.fn(
        async (): Promise<{
          chunks: RagChunk[];
          coverage?: {
            specialty: string;
            status: "ready" | "sparse" | "pending";
            chunk_count: number;
          };
        }> => ({
          chunks: [],
          coverage: {
            specialty: "kidney_transplant",
            status: "sparse",
            chunk_count: 1,
          },
        })),
    };
    const result = await callAcademic(deps, {
      hcp_id: "hcp_test",
      query: "BK virus",
    });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as {
      coverage?: { status?: string };
      repair_hint?: string;
    };
    expect(structured.coverage?.status).toBe("sparse");
    expect(structured.repair_hint ?? "").toContain("补种");
  });

  it("should_not_suggest_prefill_when_coverage_ready", async () => {
    const deps: Deps = {
      getTwin: vi.fn(async () => sampleTwin("hcp_test")),
      retrieveAcademic: vi.fn(async () => ({
        chunks: [sampleChunkF07()],
        coverage: {
          specialty: "kidney_transplant",
          status: "ready" as const,
          chunk_count: 6,
        },
      })),
    };
    const result = await callAcademic(deps, {
      hcp_id: "hcp_test",
      query: "BK virus",
    });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as {
      coverage?: { status?: string };
      repair_hint?: string;
    };
    expect(structured.coverage?.status).toBe("ready");
    expect(structured.repair_hint).toBeUndefined();
  });

  it("should_return_chunks_without_coverage_key_when_coverage_absent", async () => {
    const deps: Deps = {
      getTwin: vi.fn(async () => sampleTwin("hcp_test")),
      retrieveAcademic: vi.fn(async () => ({ chunks: [sampleChunkF07()] })),
    };
    const result = await callAcademic(deps, {
      hcp_id: "hcp_test",
      query: "BK virus",
    });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as {
      chunks?: RagChunk[];
      coverage?: unknown;
      repair_hint?: string;
    };
    expect(structured.chunks).toHaveLength(1);
    expect(structured.coverage).toBeUndefined();
    expect(structured.repair_hint).toBeUndefined();
  });
});