"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuthorIdsTable } from "@/components/AuthorIdsTable";
import { BackNavBar } from "@/components/BackNavBar";
import { TagBadges } from "@/components/TagBadges";
import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import { mergeCandidatesForConfirm } from "@/lib/merge-candidates";
import { useHcpContext } from "@/store/hcp-context";
import type { HcpTags } from "@hca/domain";

type Evidence = { kind: string; url?: string };

type AuthorIdsDraft = {
  orcid?: string | null;
  pubmed_author?: string | null;
  openalex?: string | null;
  openalex_aliases?: string[];
  google_scholar?: string | null;
  scopus_author_id?: string | null;
  cnki_scholar?: string | null;
  [key: string]: string | string[] | null | undefined;
};

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
  author_ids_draft?: AuthorIdsDraft;
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

type TFn = (key: MessageKey, vars?: Record<string, string>) => string;

function confidenceLabel(c: string, tr: TFn): string {
  if (c === "high") return tr("twins.new.match.high");
  if (c === "medium") return tr("twins.new.match.medium");
  return tr("twins.new.match.low");
}

function linkedIdLabels(
  ids: AuthorIdsDraft | undefined,
  tr: TFn,
): string[] {
  if (!ids) return [];
  const rows: [string, string | null | undefined][] = [
    ["ORCID", typeof ids.orcid === "string" ? ids.orcid : null],
    ["PubMed", typeof ids.pubmed_author === "string" ? ids.pubmed_author : null],
    ["Scholar", typeof ids.google_scholar === "string" ? ids.google_scholar : null],
    ["OpenAlex", typeof ids.openalex === "string" ? ids.openalex : null],
    ["Scopus", typeof ids.scopus_author_id === "string" ? ids.scopus_author_id : null],
  ];
  return rows
    .filter(([, v]) => Boolean(v))
    .map(([k]) => tr("twins.new.linked", { id: k }));
}

function hospitalClose(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

export default function NewTwinPage() {
  const router = useRouter();
  const tr = useT();
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
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [openalexIds, setOpenalexIds] = useState<string[]>([]);
  const [hospitalMismatch, setHospitalMismatch] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [saving, setSaving] = useState(false);
  const [knowledgeJobs, setKnowledgeJobs] = useState<KnowledgeJob[] | null>(
    null,
  );
  const [savedHcpId, setSavedHcpId] = useState<string | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [setSelected]);

  const checkedCount = checkedIds.size;

  const onQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedCandidate(null);
    setCheckedIds(new Set());
    setOpenalexIds([]);
    setHospitalMismatch(false);
    try {
      const res = await fetch("/api/twins/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hospital, dept, city }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? tr("twins.new.queryFailed"));
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

  const goConfirmSingle = (c: PersonCandidate) => {
    const oa =
      typeof c.author_ids_draft?.openalex === "string"
        ? [c.author_ids_draft.openalex]
        : [];
    setSelectedCandidate(c);
    setOpenalexIds(oa);
    setHospitalMismatch(!hospitalClose(c.hospital, hospital));
    setStep("confirm");
  };

  const goConfirmMerge = () => {
    if (!result || checkedIds.size < 2) return;
    const selectedList = result.candidates.filter((c) =>
      checkedIds.has(c.candidate_id),
    );
    const { primary, openalex_ids, hospitalMismatch: mismatch } =
      mergeCandidatesForConfirm(selectedList, hospital);
    setSelectedCandidate(primary as PersonCandidate);
    setOpenalexIds(openalex_ids);
    setHospitalMismatch(mismatch);
    setStep("confirm");
  };

  const toggleChecked = (candidateId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const onConfirm = async () => {
    const hcpId = selected?.hcpId;
    if (!hcpId) {
      setError(tr("twins.new.missingHcpId"));
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
          openalex_ids: openalexIds.length > 0 ? openalexIds : undefined,
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
        setError(data?.error?.message ?? tr("common.saveFailed"));
        return;
      }
      const savedId =
        typeof data?.hcpId === "string" ? data.hcpId : hcpId;
      setSelected(savedId, selected.name_zh, selected.name_en);
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

  const boundOpenAlexDisplay = useMemo(() => {
    if (openalexIds.length > 0) return openalexIds;
    const primary =
      typeof selected?.author_ids_draft?.openalex === "string"
        ? selected.author_ids_draft.openalex
        : null;
    const aliases = selected?.author_ids_draft?.openalex_aliases ?? [];
    return [primary, ...aliases].filter((x): x is string => Boolean(x));
  }, [openalexIds, selected]);

  if (step === "candidates" && result) {
    const list = result.candidates ?? [];
    return (
      <div className="space-y-5">
        <BackNavBar
          label={tr("twins.new.backQuery")}
          onClick={() => setStep("form")}
          actions={
            <span className="text-sm font-medium">
              {tr("twins.new.candidatesTitle")}
            </span>
          }
        />
        <p className="text-[13px] text-[var(--hca-ink-muted)]">
          {tr("twins.new.candidatesHint", { n: String(list.length) })}
        </p>
        {error && (
          <p className="text-sm text-[var(--hca-danger)]" role="alert">
            {error}
          </p>
        )}
        {list.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] p-5">
            <p className="text-sm">{tr("twins.new.candidatesEmpty")}</p>
            <button
              type="button"
              className="mt-3 rounded-[var(--radius-md)] border border-[var(--hca-line)] px-3 py-1.5 text-sm"
              onClick={() => setStep("form")}
            >
              {tr("twins.new.backQuery")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-3">
              {list.map((c, i) => {
                const bound = linkedIdLabels(c.author_ids_draft, tr);
                const checked = checkedIds.has(c.candidate_id);
                const mismatch = !hospitalClose(c.hospital, hospital);
                return (
                  <li
                    key={c.candidate_id}
                    className={`rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-4 py-4 ${
                      c.confidence === "high"
                        ? "border-l-[3px] border-l-[var(--hca-accent)]"
                        : "border-l-[3px] border-l-[var(--hca-line)]"
                    } ${checked ? "ring-1 ring-[var(--hca-accent)]" : ""}`}
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--hca-accent)]"
                          checked={checked}
                          onChange={() => toggleChecked(c.candidate_id)}
                          aria-label={`select ${c.name_zh}`}
                        />
                        <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--hca-ink-muted)]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </label>
                      <h2 className="font-[family-name:var(--font-display)] text-[22px] font-medium leading-tight">
                        {c.name_zh}
                      </h2>
                      {c.name_en ? (
                        <span className="text-[13px] text-[var(--hca-ink-muted)]">
                          {c.name_en}
                        </span>
                      ) : null}
                      <span className="ml-auto text-xs text-[var(--hca-ink-muted)]">
                        {confidenceLabel(c.confidence, tr)}
                      </span>
                    </div>
                    <p
                      className={`mt-2 text-sm ${
                        mismatch ? "text-[var(--hca-danger)]" : ""
                      }`}
                    >
                      {c.hospital}
                    </p>
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
                        {tr("twins.new.evidence")}
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
                      onClick={() => goConfirmSingle(c)}
                    >
                      {tr("twins.new.select")}
                    </button>
                  </li>
                );
              })}
            </ul>
            {checkedCount >= 2 ? (
              <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                <p className="text-[13px] text-[var(--hca-ink-muted)]">
                  {tr("twins.new.mergeHint", { n: String(checkedCount) })}
                </p>
                <button
                  type="button"
                  className="hca-btn-primary"
                  onClick={goConfirmMerge}
                >
                  {tr("twins.new.merge", { n: String(checkedCount) })}
                </button>
              </div>
            ) : null}
          </div>
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
              ? tr("twins.new.kbReady")
              : j.knowledge_status === "sparse"
                ? tr("twins.new.kbSparse")
                : tr("twins.new.kbPending")
          }`,
      )
      .join(" · ");
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--hca-accent)]">{tr("twins.new.saved")}</p>
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
          {tr("twins.new.enterWorkspace")}
        </button>
      </div>
    );
  }

  if (step === "confirm" && selected) {
    return (
      <div className="space-y-6">
        <BackNavBar
          label={tr("twins.new.backCandidates")}
          onClick={() => setStep("candidates")}
          actions={
            <button
              type="button"
              disabled={saving || !selected.hcpId}
              className="hca-btn-primary"
              onClick={() => void onConfirm()}
            >
              {saving ? tr("common.saving") : tr("twins.new.confirm")}
            </button>
          }
        />
        <p className="text-[13px] text-[var(--hca-ink-muted)]">
          {tr("twins.new.previewHint")}
        </p>
        {hospitalMismatch ? (
          <p className="text-sm text-[var(--hca-danger)]" role="alert">
            {tr("twins.new.hospitalMismatch")}
          </p>
        ) : null}
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
        {boundOpenAlexDisplay.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs text-[var(--hca-ink-muted)]">
              {tr("twins.new.openalexBound")}
            </p>
            <ul className="space-y-1 font-[family-name:var(--font-mono)] text-xs">
              {boundOpenAlexDisplay.map((id, i) => (
                <li key={id}>
                  {i === 0 ? "primary · " : "alias · "}
                  {id}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <AuthorIdsTable ids={selected.author_ids_draft} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving || !selected.hcpId}
            className="hca-btn-primary"
            onClick={() => void onConfirm()}
          >
            {saving ? tr("common.saving") : tr("twins.new.confirm")}
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--hca-line)] px-3 py-1.5 text-sm"
            onClick={() => setStep("candidates")}
          >
            {tr("twins.new.backCandidates")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackNavBar
        label={tr("twins.new.backList")}
        href="/twins"
        actions={
          <span className="text-sm font-medium">{tr("twins.new.title")}</span>
        }
      />
      <p className="max-w-[520px] text-sm text-[var(--hca-ink-muted)]">
        {tr("twins.new.intro")}
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
          <span className="text-xs text-[var(--hca-ink-muted)]">
            {tr("common.name")}
          </span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("twins.new.placeholder.name")}
            autoComplete="off"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">
            {tr("common.hospital")}
          </span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={hospital}
            onChange={(e) => setHospital(e.target.value)}
            placeholder={tr("twins.new.placeholder.hospital")}
            autoComplete="off"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">
            {tr("common.department")}
          </span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            placeholder={tr("twins.new.placeholder.dept")}
            autoComplete="off"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">
            {tr("common.cityOptional")}
          </span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={tr("twins.new.placeholder.city")}
            autoComplete="off"
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="hca-btn-primary">
            {loading ? tr("twins.new.querying") : tr("twins.new.query")}
          </button>
          <Link
            href="/twins"
            className="rounded-[var(--radius-md)] border border-[var(--hca-line)] px-4 py-2 text-sm"
          >
            {tr("common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
