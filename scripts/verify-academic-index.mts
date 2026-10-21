/**
 * feature-10（MKB2-04 / DEF-003 Close Check）：学术索引盘-vs-库逐条对比。
 * 逐学科读 data/rag/corpus/academic/{s}/chunks.jsonl 的 (pmid|doi|序号) 键集合，
 * 对比 Qdrant scroll 出的 point 集合，输出学科 pass/fail 表。任一 fail 退出码 1。
 *
 * 刻意不 import @hca/medical-kb 主入口（连带 transformers 重载）；
 * collection 名与 28 键以本地常量为准（与 packages/medical-kb/src 一致，改动须同步）。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@hca/db";
import { QdrantClient } from "@qdrant/js-client-rest";

loadRootEnv();
process.chdir(join(dirname(fileURLToPath(import.meta.url)), ".."));

const ACADEMIC_COLLECTION = "academic_index";
// 与 packages/medical-kb/src/specialty.ts CONTROLLED_SPECIALTY_KEYS 同步（28 键）
const CONTROLLED_SPECIALTY_KEYS = [
  "kidney_transplant",
  "phage_therapy",
  "down_syndrome",
  "neurology",
  "cardiology",
  "oncology",
  "hematology",
  "endocrinology",
  "gastroenterology",
  "respiratory_medicine",
  "rheumatology",
  "nephrology",
  "infectious_disease",
  "dermatology",
  "psychiatry",
  "ophthalmology",
  "otolaryngology",
  "urology",
  "general_surgery",
  "orthopedics",
  "cardiothoracic_surgery",
  "neurosurgery",
  "obstetrics_gynecology",
  "pediatrics",
  "emergency_medicine",
  "anesthesiology",
  "radiology",
  "rehabilitation_medicine",
] as const;

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? "http://127.0.0.1:6333",
  checkCompatibility: false,
});

type CorpusKeys = {
  /** 有 pmid/doi 的块按文献键比对 */
  ids: Set<string>;
  /** 无 pmid/doi 的 fixture 块只能按计数比对（库侧无行号信息） */
  fallbackCount: number;
};

function corpusKeys(specialty: string): CorpusKeys {
  const file = join("./data/rag/corpus/academic", specialty, "chunks.jsonl");
  const ids = new Set<string>();
  let fallbackCount = 0;
  if (!existsSync(file)) return { ids, fallbackCount };
  for (const line of readFileSync(file, "utf8").split("\n").filter((l) => l.trim())) {
    const c = JSON.parse(line) as { pmid?: string; doi?: string };
    if (c.pmid) ids.add(`pmid:${c.pmid}`);
    else if (c.doi) ids.add(`doi:${c.doi}`);
    else fallbackCount++;
  }
  return { ids, fallbackCount };
}

type DbKeys = { ids: Set<string>; fallbackCount: number };

async function dbKeys(specialty: string): Promise<DbKeys> {
  const ids = new Set<string>();
  let fallbackCount = 0;
  const seenIds = new Set<string>();
  // scroll offset 语义含头（重返回游标点），seenIds 去重、无新点即终止
  let offset: string | number | undefined = undefined;
  for (;;) {
    const page = await qdrant.scroll(ACADEMIC_COLLECTION, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,
      filter: { must: [{ key: "specialty", match: { value: specialty } }] },
    });
    const fresh = page.points.filter((p) => !seenIds.has(String(p.id)));
    for (const p of fresh) {
      seenIds.add(String(p.id));
      const payload = (p.payload ?? {}) as { pmid?: string | null; doi?: string | null };
      if (payload.pmid) ids.add(`pmid:${payload.pmid}`);
      else if (payload.doi) ids.add(`doi:${payload.doi}`);
      else fallbackCount++;
    }
    if (fresh.length === 0) break;
    offset = page.points[page.points.length - 1]!.id as string | number;
  }
  return { ids, fallbackCount };
}

async function main(): Promise<void> {
  let pass = 0;
  let fail = 0;
  const failures: string[] = [];
  for (const specialty of CONTROLLED_SPECIALTY_KEYS) {
    const disk = corpusKeys(specialty);
    const db = await dbKeys(specialty);
    const missing = [...disk.ids].filter((id) => !db.ids.has(id));
    const extra = [...db.ids].filter((id) => !disk.ids.has(id));
    const fallbackMismatch = disk.fallbackCount !== db.fallbackCount;
    const ok = missing.length === 0 && extra.length === 0 && !fallbackMismatch;
    if (ok) pass++;
    else fail++;
    const mark = ok ? "PASS" : "FAIL";
    const detail =
      missing.length ? ` 缺:${missing.join(",")}` :
      extra.length ? ` 多:${extra.join(",")}` :
      fallbackMismatch ? ` fixture 块数 盘${disk.fallbackCount}/库${db.fallbackCount}` : "";
    console.log(
      `${mark} ${specialty.padEnd(28)} 盘 ${String(disk.ids.size + disk.fallbackCount).padStart(2)} 库 ${String(db.ids.size + db.fallbackCount).padStart(2)}${detail}`,
    );
    if (!ok) failures.push(specialty);
  }

  console.log(`\n${pass}/${CONTROLLED_SPECIALTY_KEYS.length} 学科盘-vs-库逐条相等`);
  if (fail > 0) {
    console.error(`FAIL 学科：${failures.join(", ")}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
