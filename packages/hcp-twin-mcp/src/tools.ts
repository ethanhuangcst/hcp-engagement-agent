import { z } from "zod";
import {
  HcpTierSchema,
  RoleTagSchema,
  mcpError,
  type McpError,
} from "@hca/domain";
import type { TwinStore } from "./store.js";
import {
  ZHU_AUTHOR_IDS,
  ZHU_HCP_ID,
  ZHU_TAGS,
  buildZhuTongyuInsights,
  buildZhuTongyuTwin,
} from "./fixtures/zhu-tongyu.js";
import { applyTagOverride, ruleTagFromProfile, tagsFromTwin } from "./tagging.js";

export const ResolveInputSchema = z.object({
  name: z.string().min(1),
  hospital: z.string().min(1),
  dept: z.string().min(1),
  city: z.string().optional(),
});

export const GetTwinInputSchema = z.object({
  hcpId: z.string().min(1),
});

export const GetInsightsInputSchema = z.object({
  hcpId: z.string().min(1),
});

export const TagHcpInputSchema = z.object({
  hcpId: z.string().min(1),
  force_rule: z.boolean().optional(),
  override: z
    .object({
      hcp_tier: HcpTierSchema.optional(),
      role_tags: z.array(RoleTagSchema).optional(),
    })
    .optional(),
});

export const HealthCheckInputSchema = z.object({});

export type ToolOk<T> = { ok: true; data: T };
export type ToolFail = { ok: false; error: McpError };
export type ToolResult<T> = ToolOk<T> | ToolFail;

function validationFail(err: z.ZodError): ToolFail {
  return {
    ok: false,
    error: mcpError("VALIDATION_ERROR", "入参校验失败", {
      details: { issues: err.issues.map((i) => ({ path: i.path, message: i.message })) },
      repair_hint: "检查必填字段 name/hospital/dept 或 hcpId",
    }),
  };
}

export type ResolveResult = {
  disambiguation_status: "resolved" | "ambiguous" | "unresolved";
  hcpId?: string;
  url_candidates: Array<{
    url: string;
    label: string;
    confidence: "high" | "medium" | "low";
  }>;
  author_ids_draft?: Record<string, string | null | undefined>;
  tags_draft?: typeof ZHU_TAGS;
  evidence?: string[];
  persisted: false;
};

export async function resolveHcpIdentity(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<ResolveResult>> {
  const parsed = ResolveInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const { name, hospital, dept } = parsed.data;
  const q = `${name}${hospital}${dept}`;

  // Mock / MVP-1: fixture path for 朱同玉; never writes full Twin (F-MCP-012)
  if (q.includes("朱") || q.includes("中山") || name.includes("Tongyu")) {
    const tags_draft = ruleTagFromProfile({
      title: "主任医师 / 教授",
      hospital,
      roleHints: ["KOL", "KME", "行政", "政策"],
    });
    return {
      ok: true,
      data: {
        disambiguation_status: "ambiguous",
        hcpId: ZHU_HCP_ID,
        url_candidates: [
          {
            url: "https://www.zs-hospital.sh.cn/",
            label: "复旦大学附属中山医院专家页",
            confidence: "high",
          },
          {
            url: `https://openalex.org/authors/${ZHU_AUTHOR_IDS.openalex}`,
            label: "OpenAlex Author",
            confidence: "medium",
          },
        ],
        author_ids_draft: ZHU_AUTHOR_IDS,
        tags_draft,
        evidence: ["mock_fixture:zhu-tongyu", `twin_mode=${store.mode}`],
        persisted: false,
      },
    };
  }

  if (name.includes("无此人") || name.includes("查无")) {
    return {
      ok: true,
      data: {
        disambiguation_status: "unresolved",
        url_candidates: [],
        evidence: ["no_public_match"],
        persisted: false,
      },
    };
  }

  return {
    ok: true,
    data: {
      disambiguation_status: "unresolved",
      url_candidates: [],
      evidence: ["no_fixture_match"],
      persisted: false,
    },
  };
}

/** BFF「确认并保存」：写入 Twin + Insights（resolve 本身不落库）. */
export async function confirmAndSaveTwin(
  store: TwinStore,
  hcpId: string = ZHU_HCP_ID,
): Promise<ToolResult<{ hcpId: string }>> {
  const twin =
    hcpId === ZHU_HCP_ID
      ? buildZhuTongyuTwin()
      : {
          ...buildZhuTongyuTwin(),
          meta: { ...buildZhuTongyuTwin().meta, hcp_id: hcpId },
          profile: {
            ...buildZhuTongyuTwin().profile,
          },
        };
  twin.meta.hcp_id = hcpId;
  await store.upsertTwin(twin);
  const insights = buildZhuTongyuInsights();
  insights.hcp_id = hcpId;
  await store.upsertInsights(insights);
  return { ok: true, data: { hcpId } };
}

export async function getTwinTool(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<unknown>> {
  const parsed = GetTwinInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const twin = await store.getTwin(parsed.data.hcpId);
  if (!twin) {
    return {
      ok: false,
      error: mcpError("NOT_FOUND", `未找到 Twin: ${parsed.data.hcpId}`, {
        repair_hint: "先 resolve 并由 BFF 确认保存后再 get_twin",
      }),
    };
  }
  return { ok: true, data: twin };
}

export async function getInsightsTool(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<unknown>> {
  const parsed = GetInsightsInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const row = await store.getInsights(parsed.data.hcpId);
  if (!row) {
    return {
      ok: false,
      error: mcpError("NOT_FOUND", `未找到 Insights: ${parsed.data.hcpId}`, {
        repair_hint: "确认保存分身后可读取 Insights",
      }),
    };
  }
  return { ok: true, data: row };
}

export async function tagHcpTool(
  store: TwinStore,
  raw: unknown,
): Promise<ToolResult<{ tags: unknown }>> {
  const parsed = TagHcpInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const twin = await store.getTwin(parsed.data.hcpId);
  if (!twin) {
    return {
      ok: false,
      error: mcpError("NOT_FOUND", `未找到 Twin: ${parsed.data.hcpId}`, {
        repair_hint: "tag_hcp 须在 Twin 已入库后调用",
      }),
    };
  }

  const ruleTags = tagsFromTwin(twin);
  const tags = applyTagOverride(
    twin.profile.tags,
    parsed.data.override ?? {},
    parsed.data.force_rule === true,
    ruleTags,
  );

  const updated = await store.updateTags(parsed.data.hcpId, tags);
  if (!updated) {
    return {
      ok: false,
      error: mcpError("INTERNAL_ERROR", "写入 tags 失败", { retryable: true }),
    };
  }
  return { ok: true, data: { tags } };
}

export async function healthCheckTool(
  store: TwinStore,
  raw: unknown = {},
): Promise<
  ToolResult<{
    ok: boolean;
    database_ok: boolean;
    twin_mode: string;
    playwright: "ready" | "skip" | "down";
    version: string;
  }>
> {
  const parsed = HealthCheckInputSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const database_ok = await store.ping();
  return {
    ok: true,
    data: {
      ok: true,
      database_ok,
      twin_mode: store.mode,
      playwright: "skip",
      version: "0.1.0",
    },
  };
}

export { ZHU_HCP_ID, ZHU_TAGS, buildZhuTongyuTwin };
