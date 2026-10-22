import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@hca/db";
import { seedCompliance, health, ensureDualCollectionsWithProbe } from "../api.js";

/**
 * DEF-007 / MKB2-05（rag-design §21 启动序契约）：
 * 先 ensureDualCollectionsWithProbe 再 health 预检。health 的探测读（F-RAG-023）
 * 要求双 collection 已存在，空库上先探测会 404 中止（鸡生蛋）；预检只探测
 * 「已确保存在」的对象。返回退出码，进程退出统一由 mainPromise 包装处理。
 */
export async function main(): Promise<number> {
  loadRootEnv();
  process.chdir(join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
  // 先确保双 collection 存在（空库/清库自举），再做 health 预检
  await ensureDualCollectionsWithProbe();
  const before = await health();
  console.log("health before:", before);
  if (!before.ok) {
    console.error("Qdrant 未就绪或绑定不安全，中止 seed（禁止 mock）");
    return 1;
  }
  const result = await seedCompliance({});
  console.log("seeded:", result);
  console.log("health after:", await health());
  // @hca/db 连接池会挂住事件循环，由 mainPromise 包装退出
  return 0;
}

export const mainPromise: Promise<void> = main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);