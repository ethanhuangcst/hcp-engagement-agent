"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthorIdsTable } from "@/components/AuthorIdsTable";
import { BackNavBar } from "@/components/BackNavBar";
import { TagBadges } from "@/components/TagBadges";
import { useHcpContext } from "@/store/hcp-context";
import type { HcpTags } from "@hca/domain";

type Evidence = { kind: string; url?: string };

type PersonCandidate = {
  candidate_id: string;
  name_zh: string;
  name_en?: string | null;
  hospital: string;
  department: string;
  title?: string | null;
  distinguish: string;
  confidence: "high" | "medium" | "low" | string;
  match_note: string;
  evidence: Evidence[];
  hcpId?: string;
  author_ids_draft?: Record<string, string | null | undefined>;
  tags_draft?: Partial<HcpTags> & {
    hcp_tier?: string;
    role_tags?: string[];
  };
};

type ResolveData = {
  disambiguation_status: string;
  candidates: PersonCandidate[];
  persisted?: boolean;
};

type Step = "form" | "candidates" | "confirm" | "saved";

type KnowledgeJob = {
  specialty: string;
  jobId: string;
  knowledge_status: string;
};

function confidenceLabel(c: string): string {
  if (c === "high") return "匹配较稳";
  if (c === "medium") return "需核对";
  return "证据不足";
}

function linkedIdLabels(
  ids?: Record<string, string | null | undefined>,
): string[] {
  if (!ids) return [];
  const rows: [string, string | null | undefined][] = [
    ["ORCID", ids.orcid],
    ["PubMed", ids.pubmed_author],
    ["Scholar", ids.google_scholar],
    ["OpenAlex", ids.openalex],
    ["Scopus", ids.scopus_author_id],
  ];
  return rows.filter(([, v]) => Boolean(v)).map(([k]) => `${k} 已关联`);
}

export default function NewTwinPage() {
  const router = useRouter();
  const { setSelected } = useHcpContext();
  const [name, setName] = useState("");
  const [hospital, setHospital] = useState("");
  const [dept, setDept] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResolveData | null>(null);
  const [selected, setSelectedCandidate] = useState<PersonCandidate | null>(
    null,
  );
  const [step, setStep] = useState<Step>("form");
  const [saving, setSaving] = useState(false);
  const [knowledgeJobs, setKnowledgeJobs] = useState<KnowledgeJob[] | null>(
    null,
  );
  const [savedHcpId, setSavedHcpId] = useState<string | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [setSelected]);

  const onQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedCandidate(null);
    try {
      const res = await fetch("/api/twins/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hospital, dept, city }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "查询失败");
        return;
      }
      setResult(data as ResolveData);
      setStep("candidates");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = async () => {
    const hcpId = selected?.hcpId;
    if (!hcpId) {
      setError("候选缺少 hcpId，无法保存");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/twins/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hcpId,
          name_zh: selected.name_zh,
          name_en: selected.name_en ?? null,
          hospital: selected.hospital,
          department: selected.department,
          title: selected.title ?? null,
          city: city || undefined,
          author_ids_draft: selected.author_ids_draft,
          tags_draft: selected.tags_draft
            ? {
                hcp_tier: selected.tags_draft.hcp_tier,
                role_tags: selected.tags_draft.role_tags,
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "保存失败");
        return;
      }
      const savedId =
        typeof data?.hcpId === "string" ? data.hcpId : hcpId;
      setSelected(savedId, selected.name_zh);
      const jobs = Array.isArray(data?.knowledge_jobs)
        ? (data.knowledge_jobs as KnowledgeJob[])
        : [];
      if (jobs.length > 0) {
        setSavedHcpId(savedId);
        setKnowledgeJobs(jobs);
        setStep("saved");
        return;
      }
      router.push(`/twins/${encodeURIComponent(savedId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (step === "candidates" && result) {
    const list = result.candidates ?? [];
    return (
      <div className="space-y-5">
        <BackNavBar
          label="返回修改查询"
          onClick={() => setStep("form")}
          actions={
            <span className="text-sm font-medium">
              找到以下医生 · 请点选正确的一位
            </span>
          }
        />
        <p className="text-[13px] text-[var(--hca-ink-muted)]">
          共 {list.length}{" "}
          位可能匹配。先看姓名、医院、科室是否对得上；网页链接只是依据，不是人选本身。
        </p>
        {error && (
          <p className="text-sm text-[var(--hca-danger)]" role="alert">
            {error}
          </p>
        )}
        {list.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] p-5">
            <p className="text-sm">
              未找到可信的医生人选。可补充医院官网或 ORCID 后重试，或核对姓名与科室拼写。
            </p>
            <button
              type="button"
              className="mt-3 rounded-[var(--radius-md)] border border-[var(--hca-line)] px-3 py-1.5 text-sm"
              onClick={() => setStep("form")}
            >
              返回修改查询
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((c, i) => {
              const bound = linkedIdLabels(c.author_ids_draft);
              return (
                <li
                  key={c.candidate_id}
                  className={`rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-4 py-4 ${
                    c.confidence === "high"
                      ? "border-l-[3px] border-l-[var(--hca-accent)]"
                      : "border-l-[3px] border-l-[var(--hca-line)]"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--hca-ink-muted)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2 className="font-[family-name:var(--font-display)] text-[22px] font-medium leading-tight">
                      {c.name_zh}
                    </h2>
                    {c.name_en ? (
                      <span className="text-[13px] text-[var(--hca-ink-muted)]">
                        {c.name_en}
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-[var(--hca-ink-muted)]">
                      {confidenceLabel(c.confidence)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{c.hospital}</p>
                  <p className="text-[13px] text-[var(--hca-ink-muted)]">
                    {c.department}
                    {c.title ? ` · ${c.title}` : ""}
                  </p>
                  {c.tags_draft ? (
                    <div className="mt-2">
                      <TagBadges
                        tags={{
                          hcp_tier: (c.tags_draft.hcp_tier as "T1") ?? "T3",
                          role_tags: (c.tags_draft.role_tags as never[]) ?? [],
                        }}
                      />
                    </div>
                  ) : null}
                  <p className="mt-2.5 text-[13px] leading-relaxed">
                    {c.distinguish}
                  </p>
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[11px] text-[var(--hca-ink-muted)]">
                      命中依据（供核对，非人选名称）
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(c.evidence ?? []).map((e) => (
                        <span
                          key={`${c.candidate_id}-${e.kind}-${e.url ?? ""}`}
                          className="rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-2 py-0.5 text-xs text-[var(--hca-ink-muted)]"
                          title={e.url}
                        >
                          {e.kind}
                        </span>
                      ))}
                      {bound.map((label) => (
                        <span
                          key={`${c.candidate_id}-${label}`}
                          className="rounded-[var(--radius-sm)] border border-dashed border-[var(--hca-line)] px-2 py-0.5 font-[family-name:var(--font-mono)] text-xs text-[var(--hca-ink-muted)]"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--hca-ink-muted)]">
                      {c.match_note}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="hca-btn-primary mt-3"
                    onClick={() => {
                      setSelectedCandidate(c);
                      setStep("confirm");
                    }}
                  >
                    就是这位
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  if (step === "saved" && savedHcpId) {
    const statusLine = (knowledgeJobs ?? [])
      .map(
        (j) =>
          `${j.specialty}: ${
            j.knowledge_status === "ready"
              ? "知识库已就绪"
              : j.knowledge_status === "sparse"
                ? "知识库偏少，可稍后补灌"
                : "学术知识库构建中…"
          }`,
      )
      .join(" · ");
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--hca-accent)]">分身已保存。</p>
        {statusLine ? (
          <p className="text-[13px] text-[var(--hca-ink-muted)]">{statusLine}</p>
        ) : null}
        <button
          type="button"
          className="hca-btn-primary"
          onClick={() =>
            router.push(`/twins/${encodeURIComponent(savedHcpId)}`)
          }
        >
          进入工作台
        </button>
      </div>
    );
  }

  if (step === "confirm" && selected) {
    return (
      <div className="space-y-6">
        <BackNavBar
          label="返回候选"
          onClick={() => setStep("candidates")}
          actions={
            <button
              type="button"
              disabled={saving || !selected.hcpId}
              className="hca-btn-primary"
              onClick={() => void onConfirm()}
            >
              {saving ? "保存中…" : "确认并保存"}
            </button>
          }
        />
        <p className="text-[13px] text-[var(--hca-ink-muted)]">
          已根据查询结果生成分身预览。核对 ORCID 等文献号后确认保存。
        </p>
        {error && (
          <p className="text-sm text-[var(--hca-danger)]" role="alert">
            {error}
          </p>
        )}
        <div className="space-y-2">
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium">
            {selected.name_zh}
          </h1>
          <TagBadges
            tags={
              selected.tags_draft
                ? {
                    hcp_tier: (selected.tags_draft.hcp_tier as "T1") ?? "T1",
                    role_tags: (selected.tags_draft.role_tags as never[]) ?? [],
                  }
                : null
            }
          />
          <p className="text-[13px] text-[var(--hca-ink-muted)]">
            {selected.hospital} · {selected.department}
            {selected.title ? ` · ${selected.title}` : ""}
          </p>
          <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
            hcp:{selected.hcpId ?? "—"}
          </p>
        </div>
        <AuthorIdsTable ids={selected.author_ids_draft} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving || !selected.hcpId}
            className="hca-btn-primary"
            onClick={() => void onConfirm()}
          >
            {saving ? "保存中…" : "确认并保存"}
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--hca-line)] px-3 py-1.5 text-sm"
            onClick={() => setStep("candidates")}
          >
            ← 返回候选
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackNavBar
        label="返回列表"
        href="/twins"
        actions={<span className="text-sm font-medium">新增数字分身</span>}
      />
      <p className="max-w-[520px] text-sm text-[var(--hca-ink-muted)]">
        空白录入：填写姓名、医院、科室后查询 HCP。系统检索公开记录并列出可能匹配的医生，供你消歧选择。
      </p>
      {error && (
        <p className="text-sm text-[var(--hca-danger)]" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={onQuery}
        className="max-w-[480px] space-y-3.5 rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] p-5"
      >
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">姓名</span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入姓名"
            autoComplete="off"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">医院</span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={hospital}
            onChange={(e) => setHospital(e.target.value)}
            placeholder="请输入主执业医院全称"
            autoComplete="off"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">科室</span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            placeholder="请输入科室或中心名称"
            autoComplete="off"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">城市（可选）</span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="选填"
            autoComplete="off"
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="hca-btn-primary">
            {loading ? "查询中…" : "查询 HCP"}
          </button>
          <Link
            href="/twins"
            className="rounded-[var(--radius-md)] border border-[var(--hca-line)] px-4 py-2 text-sm"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
