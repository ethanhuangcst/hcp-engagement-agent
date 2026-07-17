"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthorIdsTable } from "@/components/AuthorIdsTable";
import { BackNavBar } from "@/components/BackNavBar";
import { useHcpContext } from "@/store/hcp-context";
import type { VirtualTwin } from "@hca/domain";

export default function TwinEditPage() {
  const params = useParams<{ hcpId: string }>();
  const router = useRouter();
  const hcpId = decodeURIComponent(params.hcpId);
  const { setSelected } = useHcpContext();
  const [twin, setTwin] = useState<VirtualTwin | null>(null);
  const [name, setName] = useState("");
  const [hospital, setHospital] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/twins/${encodeURIComponent(hcpId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "加载失败");
        return;
      }
      const t = data.twin as VirtualTwin;
      setTwin(t);
      setName(t.profile.name_zh);
      setHospital(t.profile.hospital);
      setDepartment(t.profile.department);
      // 修改态不解锁洞察/一人一策（F-WEB-003）
      setSelected(null);
    })();
  }, [hcpId, setSelected]);

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
          hospital,
          department,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "保存失败");
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
    return <p className="text-sm text-[var(--hca-ink-muted)]">加载中…</p>;
  }

  const ids =
    twin?.research?.author_ids ?? twin?.profile.external_ids ?? undefined;

  return (
    <div className="space-y-6">
      <BackNavBar
        label="返回资料"
        href={`/twins/${encodeURIComponent(hcpId)}`}
        actions={<span className="text-sm font-medium">修改分身</span>}
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
          <span className="text-xs text-[var(--hca-ink-muted)]">姓名</span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">医院</span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={hospital}
            onChange={(e) => setHospital(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--hca-ink-muted)]">科室</span>
          <input
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--hca-line)] px-3 py-2"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={saving} className="hca-btn-primary">
          {saving ? "保存中…" : "保存修改"}
        </button>
      </form>

      <AuthorIdsTable ids={ids as Record<string, string | null | undefined>} />
    </div>
  );
}
