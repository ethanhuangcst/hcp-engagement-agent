/** Minimal BM25 for Chinese/English mixed compliance text (real sparse path). */

function tokenize(text: string): string[] {
  const lowered = text.toLowerCase();
  const en = lowered.match(/[a-z0-9_]+/g) ?? [];
  const zh = lowered.match(/[\u4e00-\u9fff]{1,}/g) ?? [];
  const zhGrams: string[] = [];
  for (const run of zh) {
    if (run.length <= 2) {
      zhGrams.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) {
      zhGrams.push(run.slice(i, i + 2));
    }
  }
  return [...en, ...zhGrams];
}

export type Bm25Doc = { id: string; text: string };

export class Bm25Index {
  private docs: Bm25Doc[] = [];
  private df = new Map<string, number>();
  private tf = new Map<string, Map<string, number>>();
  private avgdl = 0;
  private readonly k1 = 1.2;
  private readonly b = 0.75;

  rebuild(docs: Bm25Doc[]): void {
    this.docs = docs;
    this.df.clear();
    this.tf.clear();
    let totalLen = 0;
    for (const doc of docs) {
      const tokens = tokenize(doc.text);
      totalLen += tokens.length;
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      this.tf.set(doc.id, counts);
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgdl = docs.length ? totalLen / docs.length : 0;
  }

  search(query: string, limit = 20): Array<{ id: string; score: number }> {
    const qTokens = tokenize(query);
    const N = this.docs.length || 1;
    const scores = new Map<string, number>();

    for (const doc of this.docs) {
      const tfs = this.tf.get(doc.id) ?? new Map();
      const dl = [...tfs.values()].reduce((a, b) => a + b, 0);
      let score = 0;
      for (const qt of qTokens) {
        const f = tfs.get(qt) ?? 0;
        if (f === 0) continue;
        const df = this.df.get(qt) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const denom = f + this.k1 * (1 - this.b + this.b * (dl / (this.avgdl || 1)));
        score += idf * ((f * (this.k1 + 1)) / denom);
      }
      if (score > 0) scores.set(doc.id, score);
    }

    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

/** Reciprocal Rank Fusion */
export function rrfFuse(
  rankedLists: Array<Array<{ id: string; score: number }>>,
  weights: number[],
  k = 60,
): Array<{ id: string; score: number }> {
  const fused = new Map<string, number>();
  rankedLists.forEach((list, li) => {
    const w = weights[li] ?? 1;
    list.forEach((item, rank) => {
      const add = w * (1 / (k + rank + 1));
      fused.set(item.id, (fused.get(item.id) ?? 0) + add);
    });
  });
  return [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
