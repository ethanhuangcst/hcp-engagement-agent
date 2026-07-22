import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** Always take these from `.env` even if shell already set them (stale postgres URL). */
const FILE_WINS = new Set(["DATABASE_URL"]);

/** Load root `.env` into process.env if present (no secret logging). */
export function loadRootEnv(fromDir = process.cwd()): void {
  const candidates = [
    resolve(fromDir, ".env"),
    resolve(fromDir, "../../.env"),
    resolve(fromDir, "../../../.env"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
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
      if (FILE_WINS.has(key) || process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return;
  }
}
