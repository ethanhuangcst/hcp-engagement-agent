import { Bm25Index } from "./hybrid.js";

type CorpusRow = { id: string; text: string; payload: Record<string, unknown> };

const caches = new Map<string, { index: Bm25Index; ready: boolean }>();

export function invalidateBm25Cache(collection?: string): void {
  if (collection) {
    caches.delete(collection);
    return;
  }
  caches.clear();
}

export async function ensureBm25ForCollection(
  collection: string,
  loader: () => Promise<CorpusRow[]>,
): Promise<CorpusRow[]> {
  const rows = await loader();
  let entry = caches.get(collection);
  if (!entry) {
    entry = { index: new Bm25Index(), ready: false };
    caches.set(collection, entry);
  }
  if (!entry.ready) {
    entry.index.rebuild(rows.map((r) => ({ id: r.id, text: r.text })));
    entry.ready = true;
  }
  return rows;
}

export function bm25Search(
  collection: string,
  query: string,
  limit: number,
): Array<{ id: string; score: number }> {
  const entry = caches.get(collection);
  if (!entry?.ready) return [];
  return entry.index.search(query, limit);
}
