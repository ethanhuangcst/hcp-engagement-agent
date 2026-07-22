"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChatTypingIndicator } from "@/components/ChatTypingIndicator";
import { useLocale, useT } from "@/i18n";
import {
  loadReviseChatThread,
  saveReviseChatThread,
  type ReviseChatMsg,
} from "@/lib/revise-chat-storage";
import { twinDisplayName, useHcpContext } from "@/store/hcp-context";

type Ref = { id: string; label: string };
type Option = {
  id: string;
  label: string;
  action: string;
  owner: string;
  channel: string;
  theme: string;
  success_signal: string;
  compliance_note: string;
  priority: "P0" | "P1" | "P2";
  academic_refs: Ref[];
  compliance_refs: Ref[];
};

type GateResult = {
  status: "pass" | "conditional" | "reject";
  findings: { severity: string; rule: string; detail: string }[];
  disclaimer?: string;
};

export default function OptionsClient({ hcpId }: { hcpId: string }) {
  const tr = useT();
  const locale = useLocale();
  const openTwins = useHcpContext((s) => s.openTwins);
  const selectedName = useHcpContext((s) => s.selectedName);
  const twin = openTwins.find((t) => t.hcpId === hcpId);
  const displayName = twin
    ? twinDisplayName(twin, locale)
    : selectedName || tr("options.defaultHcp");

  const [options, setOptions] = useState<Option[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("");
  const [gate, setGate] = useState<GateResult | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const [miniDraft, setMiniDraft] = useState("");
  const [miniLog, setMiniLog] = useState<ReviseChatMsg[]>([]);
  const [reviseSessionId, setReviseSessionId] = useState<string | null>(null);
  /** 切换线程时跳过一次写回，避免把旧消息写入新 optionId */
  const skipChatSave = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/engagement/options?hcpId=${encodeURIComponent(hcpId)}&locale=${encodeURIComponent(locale)}`,
    );
    const data = await res.json();
    if (!res.ok) return;
    const opts = (data.options ?? []) as Option[];
    setOptions(opts);
    setRunId(data.runId ?? null);
    setGate(data.gate_result ?? null);
    if (opts.length) setTab((t) => t || opts[0].id);
    else setTab("");
  }, [hcpId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const opt = options.find((o) => o.id === tab) ?? options[0];

  /** 切换 HCP / run / 方案选项卡时，从 localStorage 恢复该线程 */
  useEffect(() => {
    skipChatSave.current = true;
    const lead: ReviseChatMsg = {
      role: "assistant",
      content: tr("options.chat.lead"),
    };
    if (!runId || !opt?.id) {
      setMiniLog([lead]);
      setReviseSessionId(null);
      queueMicrotask(() => {
        skipChatSave.current = false;
      });
      return;
    }
    const saved = loadReviseChatThread(hcpId, runId, opt.id);
    if (saved) {
      setMiniLog(saved.messages);
      setReviseSessionId(saved.sessionId);
    } else {
      setMiniLog([lead]);
      setReviseSessionId(null);
    }
    queueMicrotask(() => {
      skipChatSave.current = false;
    });
  }, [hcpId, runId, opt?.id, tr]);

  /** 消息变更后写回本地（按 hcp + run + option 隔离） */
  useEffect(() => {
    if (skipChatSave.current || !runId || !opt?.id) return;
    if (miniLog.length === 0) return;
    saveReviseChatThread({
      hcpId,
      runId,
      optionId: opt.id,
      sessionId: reviseSessionId,
      messages: miniLog,
      updatedAt: new Date().toISOString(),
    });
  }, [hcpId, runId, opt?.id, miniLog, reviseSessionId]);

  const generate = async () => {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/engagement/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hcpId, locale }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error?.message ?? tr("options.genFailed"));
        return;
      }
      setOptions(data.options ?? []);
      setRunId(data.runId);
      setGate(data.gate_result ?? null);
      setTab(data.options?.[0]?.id ?? "");
      setNote(
        tr("options.generated", {
          n: String(data.options?.length ?? 0),
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const sendGate = async () => {
    if (!runId) {
      setNote(tr("options.needGenerate"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/engagement/compliance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hcpId,
          optionRunId: runId,
          optionId: opt?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error?.message ?? tr("options.gateFailed"));
        return;
      }
      setGate(data.gate_result);
      if (data.options) setOptions(data.options);
    } finally {
      setBusy(false);
    }
  };

  const sendRevise = async () => {
    if (!miniDraft.trim() || !runId || !opt || replyPending) return;
    const q = miniDraft.trim();
    setMiniDraft("");
    setMiniLog((prev) => [...prev, { role: "user", content: q }]);
    setReplyPending(true);
    try {
      const res = await fetch("/api/engagement/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "revise_options",
          sessionId: reviseSessionId ?? undefined,
          hcpId,
          optionRunId: runId,
          optionId: opt.id,
          message: q,
          locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMiniLog((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error?.message ?? tr("options.chat.failed"),
          },
        ]);
        return;
      }
      setReviseSessionId(data.sessionId);
      if (data.options) setOptions(data.options);
      const last = data.messages?.[data.messages.length - 1];
      if (last?.role === "assistant") {
        setMiniLog((prev) => [
          ...prev,
          { role: "assistant", content: last.content },
        ]);
      }
    } finally {
      setReplyPending(false);
    }
  };

  const onReviseKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void sendRevise();
  };

  const gateLabel =
    gate?.status === "pass"
      ? tr("options.gate.pass")
      : gate?.status === "conditional"
        ? tr("options.gate.conditional")
        : gate?.status === "reject"
          ? tr("options.gate.reject")
          : null;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs text-[var(--hca-ink-muted)]">
            {tr("options.title")}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight">
            {tr("options.subtitle", { name: displayName })}
          </h1>
          <p className="font-mono text-[11px] text-[var(--hca-ink-muted)]">
            hcp:{hcpId}
            {runId ? ` · run=${runId}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="hca-btn-primary"
            disabled={busy}
            onClick={() => void generate()}
          >
            {tr("options.generate")}
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-3 py-1.5 text-sm"
            disabled={busy || !runId}
            onClick={() => void sendGate()}
          >
            {tr("options.gate")}
          </button>
        </div>
      </div>

      {note ? (
        <p className="text-sm text-[var(--hca-ink-muted)]">{note}</p>
      ) : null}
      {gateLabel ? (
        <div className="border-l-2 border-[var(--hca-accent)] bg-[var(--hca-accent-soft)] px-3 py-2 text-sm">
          {gateLabel}
          {gate?.findings?.[0] ? (
            <p className="mt-1 text-xs text-[var(--hca-ink-muted)]">
              {gate.findings[0].rule}: {gate.findings[0].detail}
            </p>
          ) : null}
        </div>
      ) : null}

      {options.length === 0 ? (
        <p className="max-w-[520px] text-sm text-[var(--hca-ink-muted)]">
          {tr("options.empty")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1" role="tablist">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={opt?.id === o.id}
                className={
                  opt?.id === o.id ? "hca-tab hca-tab-active" : "hca-tab"
                }
                onClick={() => setTab(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>

          {opt ? (
            <div
              className="rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] p-5"
              style={{
                borderLeftWidth: 2,
                borderLeftColor:
                  opt.priority === "P0"
                    ? "var(--hca-accent)"
                    : "var(--hca-line)",
              }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-[var(--radius-sm)] bg-[var(--hca-accent-soft)] px-2 py-0.5 text-xs font-medium">
                  {opt.priority}
                </span>
                <p className="text-sm font-semibold">{opt.action}</p>
              </div>
              <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-[var(--hca-ink-muted)]">
                  {tr("options.field.owner")}
                </dt>
                <dd>{opt.owner}</dd>
                <dt className="text-[var(--hca-ink-muted)]">
                  {tr("options.field.channel")}
                </dt>
                <dd className="font-mono text-xs">{opt.channel}</dd>
                <dt className="text-[var(--hca-ink-muted)]">
                  {tr("options.field.theme")}
                </dt>
                <dd>{opt.theme}</dd>
                <dt className="text-[var(--hca-ink-muted)]">
                  {tr("options.field.signal")}
                </dt>
                <dd className="leading-relaxed">{opt.success_signal}</dd>
                <dt className="text-[var(--hca-ink-muted)]">
                  {tr("options.field.compliance")}
                </dt>
                <dd className="text-xs leading-relaxed text-[var(--hca-ink-muted)]">
                  {opt.compliance_note}
                </dd>
                <dt className="text-[var(--hca-ink-muted)]">
                  {tr("options.field.refs")}
                </dt>
                <dd className="flex flex-wrap gap-2 font-mono text-[11px]">
                  {opt.academic_refs?.map((r) => (
                    <span
                      key={`a-${r.id}`}
                      className="rounded-[var(--radius-sm)] bg-[var(--hca-bg)] px-1.5 py-0.5"
                    >
                      {tr("options.ref.academic", { label: r.label })}
                    </span>
                  ))}
                  {opt.compliance_refs?.map((r) => (
                    <span
                      key={`c-${r.id}`}
                      className="rounded-[var(--radius-sm)] bg-[var(--hca-bg)] px-1.5 py-0.5"
                    >
                      {tr("options.ref.compliance", { label: r.label })}
                    </span>
                  ))}
                  {!opt.academic_refs?.length && !opt.compliance_refs?.length ? (
                    <span className="text-[var(--hca-ink-muted)]">
                      {tr("options.ref.empty")}
                    </span>
                  ) : null}
                </dd>
              </dl>
            </div>
          ) : null}

          <div className="border-t border-[var(--hca-line)] pt-4">
            <p className="mb-2 text-sm font-medium">
              {tr("options.chat.title")}
              {opt ? ` · ${opt.id}` : ""}
            </p>
            <p className="mb-3 text-xs text-[var(--hca-ink-muted)]">
              {tr("options.chat.hint")}
            </p>
            <div className="space-y-2">
              {miniLog.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "bg-[var(--hca-accent-soft)] px-2.5 py-2 text-sm"
                      : "border-l-2 border-[var(--hca-accent)] px-2.5 py-2 text-sm"
                  }
                >
                  {m.content}
                </div>
              ))}
              {replyPending ? <ChatTypingIndicator /> : null}
              <div className="flex items-end gap-2">
                <textarea
                  className="min-h-[4rem] flex-1 rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)] px-3 py-2 text-sm"
                  value={miniDraft}
                  onChange={(e) => setMiniDraft(e.target.value)}
                  onKeyDown={onReviseKeyDown}
                  placeholder={tr("options.chat.placeholder")}
                  rows={2}
                  disabled={replyPending}
                  aria-describedby="option-chat-hint"
                />
                <button
                  type="button"
                  className="hca-btn-primary"
                  disabled={replyPending || !runId || !miniDraft.trim()}
                  onClick={() => void sendRevise()}
                >
                  {replyPending
                    ? tr("options.chat.sending")
                    : tr("options.chat.send")}
                </button>
              </div>
              <p
                id="option-chat-hint"
                className="text-[11px] text-[var(--hca-ink-muted)]"
              >
                {tr("options.chat.footer")}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
