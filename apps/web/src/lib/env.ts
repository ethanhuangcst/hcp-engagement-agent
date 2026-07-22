import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

/**
 * Keys that must come from repo `.env` / `.env.local`, even if the shell
 * already exported a stale value (common: leftover postgresql:// from a sibling project).
 */
const FILE_WINS = new Set(["DATABASE_URL"]);

function applyEnvFile(path: string): void {
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
    if (FILE_WINS.has(key) || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Load monorepo root `.env` into process.env (BFF only). `.env.local` wins. */
export function loadRootEnv(): void {
  const rootEnv = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    "../../.env",
  );
  const localEnv = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    ".env.local",
  );

  if (!loaded && process.env.HCA_ENV_LOADED !== "1") {
    loaded = true;
    process.env.HCA_ENV_LOADED = "1";
    applyEnvFile(rootEnv);
    applyEnvFile(localEnv);
    return;
  }

  // Already loaded: still refresh FILE_WINS (DATABASE_URL) so stale shell postgres
  // cannot stick after hot reload / long-lived workers.
  applyEnvFileForce(rootEnv);
  applyEnvFileForce(localEnv);
}

function applyEnvFileForce(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!FILE_WINS.has(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function getMcpUrl(): string {
  loadRootEnv();
  const base = process.env.MCP_URL ?? "http://127.0.0.1:3200";
  return base.endsWith("/mcp") ? base : `${base.replace(/\/$/, "")}/mcp`;
}
