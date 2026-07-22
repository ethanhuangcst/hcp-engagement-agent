"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthorIdsTable } from "@/components/AuthorIdsTable";
import { BackNavBar } from "@/components/BackNavBar";
import { useT } from "@/i18n";
import { useHcpContext } from "@/store/hcp-context";
import type { VirtualTwin } from "@hca/domain";

export default function TwinEditPage() {
  const params = useParams<{ hcpId: string }>();
  const router = useRouter();
  const tr = useT();
  const hcpId = decodeURIComponent(params.hcpId);
  const { setSelected } = useHcpContext();
  const [twin, setTwin] = useState<VirtualTwin | null>(null);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [hospital, setHospital] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/twins/${encodeURIComponent(hcpId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? tr("common.loadFailed"));
        return;
      }
      const tw = data.twin as VirtualTwin;
      setTwin(tw);
      setName(tw.profile.name_zh);
      setNameEn(tw.profile.name_en ?? tw.identity?.name_en ?? "");
      setHospital(tw.profile.hospital);
      setDepartment(tw.profile.department);
      setSelected(null);
    })();
  }, [hcpId, setSelected, tr]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/twins/${encodeURIComponent(hcpId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_zh: name,
          name_en: nameEn.trim() || null,
          hospital,
          department,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? tr("common.saveFailed"));
        return;
      }
      router.push(`/twins/${encodeURIComponent(hcpId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!twin && !error) {
    return (
      <p className="text-sm text-[var(--hca-ink-muted)]">{tr("common.loading")}</p>
    );
  }

  const ids =
    twin?.research?.author_ids ?? twin?.profile.external_ids ?? undefined;

  return (
    <div className="space-y-6">
      <BackNavBar
        label={tr("twins.edit.back")}
        href={`/twins/${encodeURIComponent(hcpId)}`}
        actions={
          <span className="text-sm font-medium">{tr("twins.edit.title")}</span>
        }
      />

      {error && (
        <p className="text-sm text-[var(--hca-danger)]" role="alert">
          {error}
        </p>
      )}

      <form
        onSubmit={onSave}
        className="max-w-xl space-y-3.5 rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] p-5"
      >
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">
            {tr("common.name")}
          </span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">
            {tr("common.nameEn")}
          </span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="Changxi Wang"
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
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">
            {tr("common.department")}
          </span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={saving} className="hca-btn-primary">
          {saving ? tr("common.saving") : tr("twins.edit.save")}
        </button>
      </form>

      <AuthorIdsTable ids={ids as Record<string, string | null | undefined>} />
    </div>
  );
}
