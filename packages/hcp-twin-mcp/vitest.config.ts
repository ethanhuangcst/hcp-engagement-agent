import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      TWIN_MODE: "mock",
      ALLOW_TWIN_MOCK: "1",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/tools.ts",
        "src/tools-build.ts",
        "src/tagging.ts",
        "src/build/**/*.ts",
        "src/collectors/**/*.ts",
        "src/fixtures/**/*.ts",
      ],
      exclude: ["src/**/*.test.ts", "src/cli.ts", "src/server.ts", "src/transport.ts", "src/index.ts", "src/store.ts"],
      thresholds: {
        statements: 70,
        branches: 55,
        functions: 70,
        lines: 70,
      },
    },
  },
});
