import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@hca/db";
import {
  CONTROLLED_SPECIALTY_KEYS,
  coverageCheck,
  ensureDualCollectionsWithProbe,
  getIngestStatus,
  health,
  ingestOnDemand,
  seedAcademicBatch,
  summarizeSeedBatch,
} from "../index.js";

async function main(): Promise<void> {
  loadRootEnv();
  process.chdir(join(dirname(fileURLToPath(import.meta.url)), "../../../.."));

  // protect-eng：PubMed 启用只在进程内设置，不写 env 文件
  const noFetch = process.argv.includes("--no-fetch");
  if (!noFetch && !process.env.RAG_ACADEMIC_FETCH && !process.env.NCBI_API_KEY) {
    process.env.RAG_ACADEMIC_FETCH = "pubmed";
  }
  const force = process.argv.includes("--force");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const specialties = onlyArg
    ? onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean)
    : [...CONTROLLED_SPECIALTY_KEYS];

  // 先确保双 collection 存在（清库恢复后为空），再做 health 预检：
  // F-RAG-023 探测读在 collection 缺失时会 404 → ok:false，属预期防御
  await ensureDualCollectionsWithProbe();

  const before = await health();
  console.log("health before:", before);
  if (!before.ok) {
    console.error("Qdrant 未就绪或绑定不安全，中止 seed 批量");
    process.exit(1);
  }

  // F-RAG-029 / DEF-004：SIGTERM/SIGINT 陷阱。不立即退出，等当前学科 job 终态后自然结束
  let stopRequested = false;
  const trap = (signal: string) => {
    if (stopRequested) return;
    stopRequested = true;
    console.log(
      JSON.stringify({
        event: "signal_received",
        signal,
        action: "will_stop_after_current_specialty_terminal_state",
      }),
    );
  };
  process.on("SIGTERM", () => trap("SIGTERM"));
  process.on("SIGINT", () => trap("SIGINT"));

  const rows = await seedAcademicBatch(
    { ingestOnDemand, coverageCheck, getIngestStatus },
    // pollIntervalMs 500：28 学科轮询等待，2s 间隔会白耗 ~1 分钟
    {
      specialties,
      force,
      waitForJobs: true,
      pollIntervalMs: 500,
      shouldStop: () => stopRequested,
    },
  );

  const summary = summarizeSeedBatch(rows);
  console.log("seed batch summary:", JSON.stringify(summary));
  // @hca/db 连接池会挂住事件循环，显式退出
  process.exit(summary.failed > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
