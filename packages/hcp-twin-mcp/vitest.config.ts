import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      TWIN_MODE: "mock",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/tools.ts", "src/tagging.ts", "src/fixtures/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/cli.ts", "src/server.ts", "src/transport.ts", "src/index.ts", "src/store.ts"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
