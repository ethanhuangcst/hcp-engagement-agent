import { getIngestStatus } from "@hca/medical-kb";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";

export async function GET(req: Request) {
  loadRootEnv();
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") ?? undefined;
  const specialty = url.searchParams.get("specialty") ?? undefined;
  if (!jobId && !specialty) {
    return jsonError(
      { code: "VALIDATION_ERROR", message: "jobId 或 specialty 至少提供一个" },
      400,
    );
  }
  try {
    const result = await getIngestStatus({ jobId, specialty });
    return jsonOk(result);
  } catch (err) {
    const structured =
      typeof err === "object" && err !== null && "code" in err
        ? err
        : {
            code: "INTERNAL_ERROR",
            message: err instanceof Error ? err.message : String(err),
          };
    return jsonError(structured, 400);
  }
}
