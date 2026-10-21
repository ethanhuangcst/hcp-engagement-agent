import { beforeEach, describe, expect, it, vi } from "vitest";

const scroll = vi.fn();

vi.mock("./qdrant.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./qdrant.js")>();
  return {
    ...actual,
    getQdrantClient: () => ({ scroll }),
  };
});

import { coverageCheck, loadAcademicPayloadsForBm25 } from "./academic.js";
import { loadCompliancePayloadsForBm25 } from "./api.js";
import { ACADEMIC_COLLECTION, COMPLIANCE_COLLECTION } from "./types.js";

/** 三页：page2 含头（重返回游标点 p2），模拟 Qdrant 真实 offset 语义 */
function mockTwoPages() {
  scroll.mockReset();
  scroll
    .mockResolvedValueOnce({
      points: [{ id: "p1" }, { id: "p2" }],
      next_page_offset: "BOGUS_SEQUENTIAL_OFFSET",
    })
    .mockResolvedValueOnce({
      points: [{ id: "p2" }, { id: "p3" }],
      next_page_offset: null,
    })
    .mockResolvedValue({ points: [], next_page_offset: null });
}

beforeEach(() => {
  mockTwoPages();
});

async function assertCursorScroll(
  run: () => Promise<unknown>,
  collection: string,
  withPayload: boolean,
): Promise<void> {
  await run();
  expect(scroll).toHaveBeenCalled();
  expect(scroll.mock.calls.every((c: unknown[]) => c[0] === collection)).toBe(true);
  const first = scroll.mock.calls[0]![1] as { offset?: unknown };
  expect(first.offset).toBeUndefined();
  const second = scroll.mock.calls[1]![1] as { offset?: unknown };
  // F-RAG-034：第二次翻页以上一页最后 point id 作游标，不信任 next_page_offset
  expect(second.offset).toBe("p2");
  const payloadFlag = scroll.mock.calls[0]![1] as { with_payload?: boolean };
  expect(payloadFlag.with_payload).toBe(withPayload);
}

describe("scroll point-ID 游标（F-RAG-034 / DEF-004 稳健化）", () => {
  it("should_page_academic_bm25_loader_by_last_point_id", async () => {
    await assertCursorScroll(() => loadAcademicPayloadsForBm25(), ACADEMIC_COLLECTION, true);
  });

  it("should_page_compliance_bm25_loader_by_last_point_id", async () => {
    await assertCursorScroll(
      () => loadCompliancePayloadsForBm25(),
      COMPLIANCE_COLLECTION,
      true,
    );
  });

  it("should_page_coverage_count_by_last_point_id", async () => {
    const { status, chunk_count } = await coverageCheck("neurology");
    expect(chunk_count).toBe(3);
    expect(status).toBe("ready");
    const offsets = scroll.mock.calls.map(
      (c: unknown[]) => (c[1] as { offset?: unknown }).offset,
    );
    // 逐页游标：undefined → p2 → p3；含头重返回的 p2 被 seen 去重，不重复计数
    expect(offsets).toEqual([undefined, "p2", "p3"]);
  });
});
