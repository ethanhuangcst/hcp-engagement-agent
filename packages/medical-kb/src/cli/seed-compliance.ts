import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { seedCompliance, health, ensureDualCollectionsWithProbe } from "../api.js";

function loadRootEnv(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadRootEnv();
  process.chdir(join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
  const before = await health();
  console.log("health before:", before);
  if (!before.ok) {
    console.error("Qdrant 未就绪或绑定不安全，中止 seed（禁止 mock）");
    process.exit(1);
  }
  await ensureDualCollectionsWithProbe();
  const result = await seedCompliance({});
  console.log("seeded:", result);
  console.log("health after:", await health());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
