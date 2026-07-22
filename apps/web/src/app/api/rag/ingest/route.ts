import { z } from "zod";
import { ingestOnDemand } from "@hca/medical-kb";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";

const BodySchema = z.object({
  specialty: z.string().min(1),
  themes: z.array(z.string()).optional(),
  hcpId: z.string().optional(),
  force: z.boolean().optional(),
});

export async function POST(req: Request) {
  loadRootEnv();
  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      { code: "VALIDATION_ERROR", message: "specialty 必填" },
      400,
    );
  }
  try {
    const result = await ingestOnDemand(parsed.data);
    return jsonOk(result);
  } catch (err) {
    const structured =
      typeof err === "object" && err !== null && "code" in err
        ? err
        : {
            code: "INTERNAL_ERROR",
            message: err instanceof Error ? err.message : String(err),
          };
    const status =
      typeof structured === "object" &&
      structured !== null &&
      "code" in structured &&
      structured.code === "INGEST_IN_PROGRESS"
        ? 409
        : 502;
    return jsonError(structured, status);
  }
}
