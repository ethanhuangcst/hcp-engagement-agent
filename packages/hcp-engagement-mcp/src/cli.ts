import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { startHttp } from "./transport.js";

function loadRootEnv(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  for (const name of [".env", ".env.local"] as const) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    const override = name === ".env.local";
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

async function main(): Promise<void> {
  loadRootEnv();
  const port = Number(process.env.MCP2_PORT ?? 3300);
  await startHttp(port);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
