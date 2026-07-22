import { describe, expect, it } from "vitest";
import {
  mergeCandidatesForConfirm,
  pickPrimaryCandidate,
} from "./merge-candidates";

const base = {
  department: "感染科",
  distinguish: "",
  confidence: "medium" as const,
  match_note: "",
  evidence: [] as { kind: string }[],
};

describe("mergeCandidatesForConfirm (kol_20)", () => {
  const huashan = "复旦大学附属华山医院";
  const c1 = {
    ...base,
    candidate_id: "c1",
    name_zh: "张文宏",
    hospital: huashan,
    confidence: "high" as const,
    hcpId: "hcp_a5087829646",
    author_ids_draft: { openalex: "A5087829646" },
  };
  const c2 = {
    ...base,
    candidate_id: "c2",
    name_zh: "张文宏",
    hospital: huashan,
    hcpId: "hcp_a5087830123",
    author_ids_draft: { openalex: "A5087830123", orcid: "0000-0001-1111-2222" },
  };
  const cWrong = {
    ...base,
    candidate_id: "c3",
    name_zh: "张文宏",
    hospital: "Yunnan University",
    hcpId: "hcp_a5088060551",
    author_ids_draft: { openalex: "A5088060551" },
  };

  it("picks Huashan high-confidence as primary", () => {
    const primary = pickPrimaryCandidate([c2, c1, cWrong], huashan);
    expect(primary.candidate_id).toBe("c1");
  });

  it("merges OpenAlex ids with primary first and flags hospital mismatch", () => {
    const { primary, openalex_ids, hospitalMismatch } = mergeCandidatesForConfirm(
      [c1, c2, cWrong],
      huashan,
    );
    expect(primary.hcpId).toBe("hcp_a5087829646");
    expect(openalex_ids).toEqual([
      "A5087829646",
      "A5087830123",
      "A5088060551",
    ]);
    expect(primary.author_ids_draft?.openalex).toBe("A5087829646");
    expect(primary.author_ids_draft?.openalex_aliases).toEqual([
      "A5087830123",
      "A5088060551",
    ]);
    expect(primary.author_ids_draft?.orcid).toBe("0000-0001-1111-2222");
    expect(hospitalMismatch).toBe(true);
  });

  it("no mismatch when all hospitals match query", () => {
    const { hospitalMismatch } = mergeCandidatesForConfirm([c1, c2], huashan);
    expect(hospitalMismatch).toBe(false);
  });
});
