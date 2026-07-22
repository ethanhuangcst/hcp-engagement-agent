import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { getTwinMode, startHttp, startStdio } from "./transport.js";

function loadRootEnv(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const path = join(root, ".env");
  if (!existsSync(path)) return;
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
    // DATABASE_URL: always prefer repo .env (shell often has stale postgresql://)
    if (key === "DATABASE_URL" || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  loadRootEnv();
  const transport = (process.env.MCP_TRANSPORT ?? "http").toLowerCase();
  if (transport === "stdio") {
    await startStdio();
    return;
  }
  const port = Number(process.env.MCP_PORT ?? 3200);
  await startHttp(port);
  console.error(`twin_mode=${getTwinMode()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
