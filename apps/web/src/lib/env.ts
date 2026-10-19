import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

/** Load monorepo root .env into process.env (BFF only). */
export function loadRootEnv(): void {
  if (loaded || process.env.HCA_ENV_LOADED === "1") return;
  loaded = true;
  process.env.HCA_ENV_LOADED = "1";

  const rootDir = resolve(/* turbopackIgnore: true */ process.cwd(), "../..");
  const appLocalEnv = resolve(/* turbopackIgnore: true */ process.cwd(), ".env.local");
  const layers: { path: string; override: boolean }[] = [
    { path: resolve(rootDir, ".env"), override: false },
    { path: resolve(rootDir, ".env.local"), override: true },
    { path: appLocalEnv, override: true },
  ];
  for (const { path, override } of layers) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (override || process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function getMcpUrl(): string {
  loadRootEnv();
  const base = process.env.MCP_URL ?? "http://127.0.0.1:3200";
  return base.endsWith("/mcp") ? base : `${base.replace(/\/$/, "")}/mcp`;
}
