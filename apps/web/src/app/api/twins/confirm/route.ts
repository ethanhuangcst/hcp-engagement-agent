import { z } from "zod";
import { getMcp } from "@/lib/mcp";
import { loadRootEnv } from "@/lib/env";
import { jsonOk, jsonError } from "@/lib/api";
import {
  resolveSpecialtiesForIngest,
  triggerKnowledgeIngest,
} from "@/lib/rag-ingest";

const Schema = z.object({
  hcpId: z.string().min(1),
  name_zh: z.string().min(1).optional(),
  name_en: z.string().nullable().optional(),
  hospital: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  city: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  author_ids_draft: z
    .object({
      orcid: z.string().nullable().optional(),
      pubmed_author: z.string().nullable().optional(),
      openalex: z.string().nullable().optional(),
      openalex_aliases: z.array(z.string()).optional(),
      google_scholar: z.string().nullable().optional(),
      scopus_author_id: z.string().nullable().optional(),
      cnki_scholar: z.string().nullable().optional(),
    })
    .optional(),
  openalex_ids: z.array(z.string().min(1)).optional(),
  tags_draft: z
    .object({
      hcp_tier: z.string().optional(),
      role_tags: z.array(z.string()).optional(),
      specialties: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  loadRootEnv();
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      { code: "VALIDATION_ERROR", message: "缺少 hcpId" },
      400,
    );
  }
  try {
    const { specialties: _s, themes: _t, ...confirmPayload } = parsed.data;
    const result = await getMcp().confirmAndSaveTwin({
      ...confirmPayload,
      author_ids_draft: confirmPayload.author_ids_draft
        ? {
            orcid: confirmPayload.author_ids_draft.orcid,
            pubmed_author: confirmPayload.author_ids_draft.pubmed_author,
            openalex: confirmPayload.author_ids_draft.openalex,
            openalex_aliases: confirmPayload.author_ids_draft.openalex_aliases,
            google_scholar: confirmPayload.author_ids_draft.google_scholar,
            scopus_author_id: confirmPayload.author_ids_draft.scopus_author_id,
            cnki_scholar: confirmPayload.author_ids_draft.cnki_scholar,
          }
        : undefined,
    });
    if (!result.ok) return jsonError(result.error, 400);

    // Knowledge ingest must never fail Twin save (Docker web image has no onnxruntime).
    let knowledge_jobs: Array<{
      specialty: string;
      jobId: string;
      knowledge_status: "ready" | "sparse" | "pending" | "failed";
    }> = [];
    try {
      const specialtyKeys = resolveSpecialtiesForIngest({
        department: parsed.data.department,
        specialties: parsed.data.specialties,
        themes: parsed.data.themes,
        tags_draft: parsed.data.tags_draft,
      });
      knowledge_jobs = specialtyKeys.map((specialty) => ({
        specialty,
        jobId: "",
        knowledge_status: "pending" as const,
      }));
      if (specialtyKeys.length > 0) {
        void triggerKnowledgeIngest({
          hcpId: parsed.data.hcpId,
          department: parsed.data.department,
          specialties: parsed.data.specialties,
          themes: parsed.data.themes,
          tags_draft: parsed.data.tags_draft,
        }).catch(() => {
          /* fire-and-forget */
        });
      }
    } catch (err) {
      console.warn(
        "[confirm] knowledge ingest skipped:",
        err instanceof Error ? err.message : err,
      );
    }

    return jsonOk({
      ...(result.data as object),
      knowledge_jobs,
    });
  } catch (err) {
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        repair_hint: "确认 hcp-twin-mcp 已启动且 DATABASE_URL 可达",
      },
      502,
    );
  }
}
