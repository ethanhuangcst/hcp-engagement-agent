import { z } from "zod";
import { deleteTwin, getTwin, updateTwinIdentity } from "@hca/db";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import { getRememberedRunId } from "@/lib/build-runs";

const PatchSchema = z.object({
  name_zh: z.string().min(1).optional(),
  name_en: z.string().nullable().optional(),
  hospital: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  city: z.string().optional(),
  title: z.string().optional(),
});

type Ctx = { params: Promise<{ hcpId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  loadRootEnv();
  const { hcpId: rawId } = await ctx.params;
  const hcpId = decodeURIComponent(rawId);
  try {
    const twin = await getTwin(hcpId);
    if (!twin) {
      return jsonError(
        { code: "NOT_FOUND", message: `未找到 Twin: ${hcpId}` },
        404,
      );
    }
    const runId = getRememberedRunId(hcpId);
    return jsonOk({ twin, build: runId ? { runId } : null });
  } catch (err) {
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        repair_hint: "确认 DATABASE_URL 为 mysql://… 且实例可达（见 specs/9.deploy.md）",
      },
      502,
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  loadRootEnv();
  const { hcpId } = await ctx.params;
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      {
        code: "VALIDATION_ERROR",
        message: "修改入参无效",
        details: { issues: parsed.error.issues },
      },
      400,
    );
  }
  const twin = await updateTwinIdentity(hcpId, parsed.data);
  if (!twin) {
    return jsonError(
      { code: "NOT_FOUND", message: `未找到 Twin: ${hcpId}` },
      404,
    );
  }
  return jsonOk({ twin });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  loadRootEnv();
  const { hcpId } = await ctx.params;
  const ok = await deleteTwin(hcpId);
  if (!ok) {
    return jsonError(
      { code: "NOT_FOUND", message: `未找到 Twin: ${hcpId}` },
      404,
    );
  }
  return jsonOk({ deleted: true, hcpId });
}
