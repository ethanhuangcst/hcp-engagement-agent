import { describe, expect, it } from "vitest";
import {
  CandidateStore,
  DEFAULT_TOKEN_CAPACITY,
  DEFAULT_TOKEN_TTL_MS,
  type CandidatePayload,
} from "./candidate-store.js";

function payload(name = "测试医生"): CandidatePayload {
  return {
    hcp_id: "hcp_test",
    name_zh: name,
    hospital: "协和医院",
    department: "外科",
    author_ids: { openalex: "A5016669077" },
  };
}

describe("CandidateStore", () => {
  it("should_return_payload_when_token_issued_and_fetched", () => {
    const store = new CandidateStore();
    const token = store.issue(payload());
    expect(store.get(token)).toEqual(payload());
  });

  it("should_return_null_when_ttl_exceeded", () => {
    let now = 1_000_000;
    const store = new CandidateStore({ now: () => now });
    const token = store.issue(payload());
    now += DEFAULT_TOKEN_TTL_MS - 1;
    expect(store.get(token)).not.toBeNull();
    now += 1;
    expect(store.get(token)).toBeNull();
  });

  it("should_return_null_after_invalidate", () => {
    const store = new CandidateStore();
    const token = store.issue(payload());
    store.invalidate(token);
    expect(store.get(token)).toBeNull();
  });

  it("should_issue_distinct_tokens_for_repeat_issue", () => {
    const store = new CandidateStore();
    const a = store.issue(payload("甲"));
    const b = store.issue(payload("乙"));
    expect(a).not.toBe(b);
    expect(store.get(a)?.name_zh).toBe("甲");
    expect(store.get(b)?.name_zh).toBe("乙");
  });

  it(`should_evict_oldest_when_capacity_${DEFAULT_TOKEN_CAPACITY}_reached`, () => {
    const store = new CandidateStore({ capacity: 3 });
    const first = store.issue(payload("最早"));
    const second = store.issue(payload("次早"));
    store.issue(payload("最新"));
    store.issue(payload("溢出"));
    expect(store.get(first)).toBeNull();
    expect(store.get(second)?.name_zh).toBe("次早");
  });

  it("should_get_payload_again_after_failed_add_lookup", () => {
    const store = new CandidateStore();
    const token = store.issue(payload());
    expect(store.get("cand_unknown")).toBeNull();
    expect(store.get(token)).not.toBeNull();
  });
});