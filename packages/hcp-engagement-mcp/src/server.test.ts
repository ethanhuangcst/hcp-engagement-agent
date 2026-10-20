import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SCHEMA_VERSION, type VirtualTwin } from "@hca/domain";
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