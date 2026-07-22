import { afterEach, describe, expect, it } from "vitest";
import { getTwinMode } from "./transport.js";

describe("getTwinMode product gate", () => {
  const prev = {
    TWIN_MODE: process.env.TWIN_MODE,
    ALLOW_TWIN_MOCK: process.env.ALLOW_TWIN_MOCK,
    VITEST: process.env.VITEST,
  };

  afterEach(() => {
    process.env.TWIN_MODE = prev.TWIN_MODE;
    process.env.ALLOW_TWIN_MOCK = prev.ALLOW_TWIN_MOCK;
    process.env.VITEST = prev.VITEST;
  });

  it("defaults to live", () => {
    delete process.env.TWIN_MODE;
    expect(getTwinMode()).toBe("live");
  });

  it("allows mock when ALLOW_TWIN_MOCK=1", () => {
    process.env.TWIN_MODE = "mock";
    process.env.ALLOW_TWIN_MOCK = "1";
    expect(getTwinMode()).toBe("mock");
  });

  it("rejects bare mock outside CI allowlist", () => {
    process.env.TWIN_MODE = "mock";
    delete process.env.ALLOW_TWIN_MOCK;
    process.env.VITEST = "false";
    expect(getTwinMode()).toBe("live");
  });
});
