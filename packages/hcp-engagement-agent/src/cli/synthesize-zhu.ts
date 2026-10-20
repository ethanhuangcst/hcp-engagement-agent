import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv, upsertInsights, upsertTwin } from "@hca/db";
import { sampleZhuInsights, sampleZhuTwin, ZHU_HCP_ID } from "../fixtures/zhu.js";
import { health } from "../health.js";
import { synthesizeDoingNow } from "../synthesize.js";

async function main(): Promise<void> {
  loadRootEnv();
  process.chdir(join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
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
