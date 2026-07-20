"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChatTypingIndicator } from "@/components/ChatTypingIndicator";
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
  const activeTitleRef = useRef("开放对话");

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
          "历史会话";
        setActiveId(sessionId);
        activeTitleRef.current = title;
        setMessages(msgs.length ? msgs : [DEFAULT_AGENT_GREETING]);
        if (msgs.length) persistLocal(sessionId, msgs, title);
      } catch {
        /* ignore */
      }
    },
    [index, persistLocal],
  );

  const newSession = () => {
    setActiveId(null);
    activeTitleRef.current = "开放对话";
    setMessages([DEFAULT_AGENT_GREETING]);
    setFiles([]);
  };

  const send = async () => {
    if (!draft.trim() || busy) return;
    const text = draft.trim();
    const attachments = files.map((name) => ({
      name,
      summary: "用户上传附件元数据",
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const failed: AgentChatMsg[] = [
          ...withUser,
          {
            role: "assistant",
            content: data.error?.message ?? "对话失败",
          },
        ];
        setMessages(failed);
        if (activeId) persistLocal(activeId, failed);
        return;
      }
      const sessionId = data.sessionId as string;
      const title =
        activeId && activeTitleRef.current !== "开放对话"
          ? activeTitleRef.current
          : text.slice(0, 24) || "开放对话";
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
          HCP Engagement 智能助理
        </h1>
      </div>

      <div className="flex flex-wrap gap-4">
        <aside className="w-52 shrink-0 space-y-2">
          <button
            type="button"
            className="hca-btn-primary w-full"
            onClick={newSession}
          >
            新建会话
          </button>
          <p className="text-xs text-[var(--hca-ink-muted)]">
            历史（本机浏览器）
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
              <li className="text-xs text-[var(--hca-ink-muted)]">暂无历史</li>
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
                    附件：{m.attachments.map((a) => a.name).join("、")}
                  </p>
                ) : null}
              </div>
            ))}
            {busy ? <ChatTypingIndicator /> : null}
          </div>

          <div className="border-t border-[var(--hca-line)] p-3">
            {files.length > 0 ? (
              <p className="mb-2 font-mono text-[11px] text-[var(--hca-ink-muted)]">
                待发送附件：{files.join("、")}
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <label className="cursor-pointer rounded-[var(--radius-md)] border border-[var(--hca-line)] px-2 py-1.5 text-xs text-[var(--hca-ink-muted)]">
                附件
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
                placeholder="输入问题…"
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
                {busy ? "发送中…" : "发送"}
              </button>
            </div>
            <p
              id="agent-chat-hint"
              className="mt-2 text-[11px] text-[var(--hca-ink-muted)]"
            >
              Enter 发送 · Shift+Enter 换行 · 记录保存在本机
            </p>
          </div>

          <button
            type="button"
            aria-label="调整对话面板尺寸"
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
        面板最小 {MIN_W}×{MIN_H}；通用会话索引与消息写入本机 localStorage。服务端落在通用工作区以便续聊。
      </p>
    </div>
  );
}
