import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SCHEMA_VERSION, type VirtualTwin } from "@hca/domain";
import { createMcpServer, SPRINT1_TOOLS, type QueryTwinsFn } from "./server.js";

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

async function connect(queryTwins?: QueryTwinsFn) {
  const server = createMcpServer(queryTwins ? { queryTwins } : undefined);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

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
      expect.arrayContaining(["hcp_id", "name", "hospital", "department", "city"]),
    );
    expect(query.annotations?.readOnlyHint).toBe(true);

    const add = byName.get("add_hcp")!;
    expect(add.inputSchema.required).toEqual(
      expect.arrayContaining(["hcp_id", "name_zh", "hospital", "department"]),
    );
    expect(add.annotations?.readOnlyHint).toBeFalsy();
    await client.close();
  });

  it("should_return_structured_stub_error_when_sprint1_tool_called", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "list_hcp", arguments: {} });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { error?: { code?: string; message?: string } };
    expect(structured.error?.code).toBe("INTERNAL_ERROR");
    expect(structured.error?.message).toContain("feature");
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
    const client = await connect(mockQuery);
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
    const client = await connect(mockQuery);
    const result = await client.callTool({
      name: "query_hcp",
      arguments: { hcp_id: "hcp_missing" },
    });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { error?: { code?: string } };
    expect(structured.error?.code).toBe("NOT_FOUND");
    await client.close();
  });
});
