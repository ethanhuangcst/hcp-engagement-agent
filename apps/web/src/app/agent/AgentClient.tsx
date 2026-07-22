"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChatTypingIndicator } from "@/components/ChatTypingIndicator";
import { useLocale, useT } from "@/i18n";
import {
  DEFAULT_AGENT_GREETING,
  loadAgentIndex,
  loadAgentSession,
  upsertAgentSessionMessages,
  type AgentChatMsg,
  type AgentSessionIndexItem,
} from "@/lib/agent-chat-storage";

const MIN_W = 480;
const MIN_H = 320;

export default function AgentClient() {
  const tr = useT();
  const locale = useLocale();
  const [index, setIndex] = useState<AgentSessionIndexItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentChatMsg[]>([
    DEFAULT_AGENT_GREETING,
  ]);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [panelW, setPanelW] = useState(720);
  const [panelH, setPanelH] = useState(420);
  const dragOrigin = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const activeTitleRef = useRef(tr("agent.openChat"));

  useEffect(() => {
    setIndex(loadAgentIndex());
  }, []);

  const persistLocal = useCallback(
    (sessionId: string, nextMessages: AgentChatMsg[], title?: string) => {
      const t = title ?? activeTitleRef.current;
      activeTitleRef.current = t;
      upsertAgentSessionMessages({
        sessionId,
        title: t,
        messages: nextMessages,
      });
      setIndex(loadAgentIndex());
    },
    [],
  );

  const loadSession = useCallback(
    async (sessionId: string) => {
      const local = loadAgentSession(sessionId);
      if (local && local.messages.length > 0) {
        setActiveId(sessionId);
        activeTitleRef.current = local.title;
        setMessages(local.messages);
        return;
      }
      try {
        const res = await fetch(
          `/api/engagement/sessions/${encodeURIComponent(sessionId)}`,
        );
        const data = await res.json();
        if (!res.ok || !data.session) return;
        const msgs = (data.session.messages as AgentChatMsg[]).filter(
          (m) => m.role === "user" || m.role === "assistant",
        );
        const title =
          data.session.title ||
          index.find((s) => s.sessionId === sessionId)?.title ||
          tr("agent.historySession");
        setActiveId(sessionId);
        activeTitleRef.current = title;
        setMessages(msgs.length ? msgs : [DEFAULT_AGENT_GREETING]);
        if (msgs.length) persistLocal(sessionId, msgs, title);
      } catch {
        /* ignore */
      }
    },
    [index, persistLocal, tr],
  );

  const newSession = () => {
    setActiveId(null);
    activeTitleRef.current = tr("agent.openChat");
    setMessages([DEFAULT_AGENT_GREETING]);
    setFiles([]);
  };

  const send = async () => {
    if (!draft.trim() || busy) return;
    const text = draft.trim();
    const openChatTitle = tr("agent.openChat");
    const attachments = files.map((name) => ({
      name,
      summary: tr("agent.attachSummary"),
    }));
    setDraft("");
    const withUser: AgentChatMsg[] = [
      ...messages,
      { role: "user", content: text, attachments },
    ];
    setMessages(withUser);
    setBusy(true);
    try {
      const res = await fetch("/api/engagement/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "open_chat",
          sessionId: activeId ?? undefined,
          message: text,
          attachments: attachments.length ? attachments : undefined,
          locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const failed: AgentChatMsg[] = [
          ...withUser,
          {
            role: "assistant",
            content: data.error?.message ?? tr("agent.failed"),
          },
        ];
        setMessages(failed);
        if (activeId) persistLocal(activeId, failed);
        return;
      }
      const sessionId = data.sessionId as string;
      const title =
        activeId && activeTitleRef.current !== openChatTitle
          ? activeTitleRef.current
          : text.slice(0, 24) || openChatTitle;
      activeTitleRef.current = title;
      setActiveId(sessionId);
      const last = data.messages?.[data.messages.length - 1];
      const nextMessages: AgentChatMsg[] =
        last?.role === "assistant"
          ? [...withUser, { role: "assistant", content: last.content }]
          : withUser;
      setMessages(nextMessages);
      persistLocal(sessionId, nextMessages, title);
      setFiles([]);
    } finally {
      setBusy(false);
    }
  };

  const onDraftKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void send();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragOrigin.current) return;
      const dx = e.clientX - dragOrigin.current.x;
      const dy = e.clientY - dragOrigin.current.y;
      setPanelW(Math.max(MIN_W, dragOrigin.current.w + dx));
      setPanelH(Math.max(MIN_H, dragOrigin.current.h + dy));
    };
    const onUp = () => {
      dragOrigin.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight">
          {tr("agent.title")}
        </h1>
      </div>

      <div className="flex flex-wrap gap-4">
        <aside className="w-52 shrink-0 space-y-2">
          <button
            type="button"
            className="hca-btn-primary w-full"
            onClick={newSession}
          >
            {tr("agent.newSession")}
          </button>
          <p className="text-xs text-[var(--hca-ink-muted)]">
            {tr("agent.history")}
          </p>
          <ul className="space-y-1">
            {index.map((s) => (
              <li key={s.sessionId}>
                <button
                  type="button"
                  className={
                    activeId === s.sessionId
                      ? "w-full rounded-[var(--radius-md)] bg-[var(--hca-accent-soft)] px-2 py-1.5 text-left text-xs"
                      : "w-full rounded-[var(--radius-md)] px-2 py-1.5 text-left text-xs text-[var(--hca-ink-muted)] hover:bg-[var(--hca-bg)]"
                  }
                  onClick={() => void loadSession(s.sessionId)}
                >
                  {s.title}
                </button>
              </li>
            ))}
            {index.length === 0 ? (
              <li className="text-xs text-[var(--hca-ink-muted)]">
                {tr("agent.historyEmpty")}
              </li>
            ) : null}
          </ul>
        </aside>

        <div
          className="relative flex min-w-0 flex-col rounded-[var(--radius-md)] border border-[var(--hca-line)] bg-[var(--hca-surface)]"
          style={{ width: panelW, height: panelH, maxWidth: "100%" }}
        >
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-8 rounded-[var(--radius-md)] bg-[var(--hca-accent-soft)] px-3 py-2 text-sm leading-relaxed"
                    : "mr-8 border-l-2 border-[var(--hca-accent)] px-3 py-2 text-sm leading-relaxed"
                }
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.attachments?.length ? (
                  <p className="mt-1 font-mono text-[11px] text-[var(--hca-ink-muted)]">
                    {tr("agent.attachments", {
                      names: m.attachments.map((a) => a.name).join(", "),
                    })}
                  </p>
                ) : null}
              </div>
            ))}
            {busy ? <ChatTypingIndicator /> : null}
          </div>

          <div className="border-t border-[var(--hca-line)] p-3">
            {files.length > 0 ? (
              <p className="mb-2 font-mono text-[11px] text-[var(--hca-ink-muted)]">
                {tr("agent.attachPending", { names: files.join(", ") })}
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <label className="cursor-pointer rounded-[var(--radius-md)] border border-[var(--hca-line)] px-2 py-1.5 text-xs text-[var(--hca-ink-muted)]">
                {tr("agent.attach")}
                <input
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    const names = Array.from(e.target.files ?? []).map(
                      (f) => f.name,
                    );
                    setFiles((prev) => [...prev, ...names].slice(0, 5));
                    e.target.value = "";
                  }}
                />
              </label>
              <textarea
                className="min-h-[3.5rem] flex-1 rounded-[var(--radius-md)] border border-[var(--hca-line)] px-3 py-2 text-sm"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onDraftKeyDown}
                placeholder={tr("agent.placeholder")}
                rows={2}
                disabled={busy}
                aria-describedby="agent-chat-hint"
              />
              <button
                type="button"
                className="hca-btn-primary"
                disabled={busy || !draft.trim()}
                onClick={() => void send()}
              >
                {busy ? tr("agent.sending") : tr("agent.send")}
              </button>
            </div>
            <p
              id="agent-chat-hint"
              className="mt-2 text-[11px] text-[var(--hca-ink-muted)]"
            >
              {tr("agent.footer")}
            </p>
          </div>

          <button
            type="button"
            aria-label={tr("agent.resize")}
            className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize border border-[var(--hca-line)] bg-[var(--hca-bg)]"
            onMouseDown={(e) => {
              dragOrigin.current = {
                x: e.clientX,
                y: e.clientY,
                w: panelW,
                h: panelH,
              };
              e.preventDefault();
            }}
          />
        </div>
      </div>
      <p className="text-xs text-[var(--hca-ink-muted)]">
        {tr("agent.panelHint", {
          w: String(MIN_W),
          h: String(MIN_H),
        })}
      </p>
    </div>
  );
}
