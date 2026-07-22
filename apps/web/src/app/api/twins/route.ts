import { listTwins } from "@hca/db";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";

export async function GET() {
  loadRootEnv();
  try {
    const items = await listTwins();
    return jsonOk({ count: items.length, items });
  } catch (err) {
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
}
