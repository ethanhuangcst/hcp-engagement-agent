import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@hca/db";
import {
  health,
  ensureDualCollectionsWithProbe,
  ingestOnDemand,
  getIngestStatus,
} from "../index.js";

async function main(): Promise<void> {
  loadRootEnv();
  process.chdir(join(dirname(fileURLToPath(import.meta.url)), "../../../.."));

  const specialty = process.argv[2] ?? "kidney_transplant";
  const force = process.argv.includes("--force");

  const before = await health();
  console.log("health before:", before);
  if (!before.ok) {
    console.error("Qdrant 未就绪或绑定不安全，中止 ingest");
    process.exit(1);
  }
  await ensureDualCollectionsWithProbe();

  const started = await ingestOnDemand({ specialty, force });
  console.log("ingest started:", started);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await getIngestStatus({ jobId: started.jobId });
    console.log("status:", status);
    if (
      status.knowledge_status === "ready" ||
      status.knowledge_status === "sparse" ||
      status.knowledge_status === "failed"
    ) {
      break;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
