import { QdrantClient } from "@qdrant/js-client-rest";
import { getQdrantUrl } from "./config.js";
import { assertSafeQdrantUrl } from "./security.js";
import {
  ACADEMIC_COLLECTION,
  COMPLIANCE_COLLECTION,
  ragError,
} from "./types.js";

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  const url = getQdrantUrl();
  const safe = assertSafeQdrantUrl(url);
  if (!safe.ok) throw safe.error;
  if (!client) {
    client = new QdrantClient({
      url,
      checkCompatibility: false,
    });
  }
  return client;
}

export async function ensureCollections(vectorSize: number): Promise<void> {
  const q = getQdrantClient();
  for (const name of [ACADEMIC_COLLECTION, COMPLIANCE_COLLECTION]) {
    const exists = await q.collectionExists(name);
    if (exists.exists) continue;
    await q.createCollection(name, {
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
    });
  }
}

export async function pingQdrant(): Promise<boolean> {
  try {
    const safe = assertSafeQdrantUrl(getQdrantUrl());
    if (!safe.ok) return false;
    const q = getQdrantClient();
    await q.getCollections();
    return true;
  } catch {
    return false;
  }
}

export async function listCollectionNames(): Promise<string[]> {
  const q = getQdrantClient();
  const res = await q.getCollections();
  return res.collections.map((c) => c.name);
}

export function resetQdrantClientForTests(): void {
  client = null;
}

export { ACADEMIC_COLLECTION, COMPLIANCE_COLLECTION, ragError };
