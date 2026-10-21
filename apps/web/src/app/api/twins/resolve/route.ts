import { z } from "zod";
import { getMcp } from "@/lib/mcp";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import { specialtyDisplayName } from "@/lib/rag-ingest";

const Schema = z.object({
  name: z.string().min(1),
  hospital: z.string().min(1),
  dept: z.string().min(1),
  city: z.string().optional(),
});

export async function POST(req: Request) {
  loadRootEnv();
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      {
        code: "VALIDATION_ERROR",
        message: "请填写姓名、医院、科室",
        details: { issues: parsed.error.issues },
        repair_hint: "补全查询锚点后再试",
      },
      400,
    );
  }
  try {
    const result = await getMcp().resolveHcpIdentity(parsed.data);
    if (!result.ok) return jsonError(result.error, 400);
    /**
     * feature-12（MCP2-10 / DEF-006，D2）：服务端算好将入库科室（信号专科标准中文名）随候选下发，
     * 确认页只读展示；客户端不直接依赖 @hca/medical-kb（避免把检索依赖打进浏览器包）。
     */
    const data = result.data as {
      disambiguation_status?: string;
      persisted?: boolean;
      candidates?: {
        department_signal?: { specialty?: string };
        [key: string]: unknown;
      }[];
    };
    const candidates = (data.candidates ?? []).map((c) => {
      const signalKey = c.department_signal?.specialty?.trim();
      const department_ingest = signalKey
        ? specialtyDisplayName(signalKey)
        : undefined;
      return department_ingest ? { ...c, department_ingest } : { ...c };
    });
    return jsonOk({ ...data, candidates });
  } catch (err) {
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        repair_hint: "确认 hcp-twin-mcp 已在 MCP_URL 启动",
      },
      502,
    );
  }
}
