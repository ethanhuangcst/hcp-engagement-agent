import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@hca/db";
import { seedCompliance, health, ensureDualCollectionsWithProbe } from "../api.js";

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
  // @hca/db 连接池会挂住事件循环，显式退出
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
