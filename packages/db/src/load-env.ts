import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

function applyEnvFile(path: string, override: boolean): void {
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
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

function resolveEnvRoot(fromDir: string): string {
  let dir = resolve(fromDir);
  for (let i = 0; i < 6; i++) {
    if (
      existsSync(resolve(dir, ".env")) ||
      existsSync(resolve(dir, ".env.local")) ||
      existsSync(resolve(dir, "package.json"))
    ) {
      const pkg = resolve(dir, "package.json");
      if (existsSync(pkg)) {
        try {
          const raw = readFileSync(pkg, "utf8");
          if (raw.includes('"workspaces"')) return dir;
        } catch {
          /* ignore */
        }
      }
      if (
        existsSync(resolve(dir, ".env")) ||
        existsSync(resolve(dir, ".env.local"))
      ) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(fromDir);
}

/** Load repo root `.env` then `.env.local` (local overrides). No secret logging. */
export function loadRootEnv(fromDir = process.cwd()): void {
  const root = resolveEnvRoot(fromDir);
  for (const name of [".env", ".env.local"] as const) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    applyEnvFile(path, name === ".env.local");
  }
}
