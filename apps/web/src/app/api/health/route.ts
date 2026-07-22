import { pingDatabase } from "@hca/db";
import { getMcp } from "@/lib/mcp";
import { loadRootEnv } from "@/lib/env";
import { jsonOk } from "@/lib/api";

export async function GET() {
  loadRootEnv();
  const database_ok = await pingDatabase();
  let mcp: unknown = { ok: false };
  try {
    const r = await getMcp().healthCheck();
    mcp = r.ok ? r.data : { ok: false, error: r.error };
  } catch (err) {
    mcp = {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
  const mcpOk =
    typeof mcp === "object" &&
    mcp !== null &&
    "ok" in mcp &&
    (mcp as { ok?: boolean }).ok === true;
  return jsonOk({
    ok: database_ok && mcpOk,
    database_ok,
    mcp,
  });
}
