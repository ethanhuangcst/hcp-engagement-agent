import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { upsertInsights, upsertTwin } from "@hca/db";
import { sampleZhuInsights, sampleZhuTwin, ZHU_HCP_ID } from "../fixtures/zhu.js";
import { health } from "../health.js";
import { synthesizeDoingNow } from "../synthesize.js";

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
  process.chdir(root);
}

async function main(): Promise<void> {
  loadRootEnv();
  const h = await health({ probeLlm: true });
  console.log("health:", JSON.stringify(h, null, 2));
  if (!h.ok) {
    console.error("LLM 或数据库未就绪，中止（禁止 mock）");
    process.exit(1);
  }

  await upsertTwin(sampleZhuTwin());
  await upsertInsights(sampleZhuInsights());
  const result = await synthesizeDoingNow({
    hcpId: ZHU_HCP_ID,
    refresh: true,
  });
  console.log("doing_now:", JSON.stringify(result.doing_now, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
