import { describe, expect, it } from "vitest";
import {
  retrieveAcademicForAgent,
  retrieveComplianceForAgent,
} from "./retrieve.js";

describe("agent retrieve wrappers", () => {
  it("surfaces VALIDATION_ERROR for invalid academic input", async () => {
    await expect(retrieveAcademicForAgent({ query: "" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("surfaces VALIDATION_ERROR for invalid compliance input", async () => {
    await expect(
      retrieveComplianceForAgent({ query: "" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
