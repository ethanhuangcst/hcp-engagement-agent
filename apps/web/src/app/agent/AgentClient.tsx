"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHcpContext } from "@/store/hcp-context";

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  attachments?: { name: string }[];
};

type SessionIndex = {
  sessionId: string;
  title: string;
  hcpId: string;
};

const COOKIE_KEY = "hca-agent-session-index";
const MIN_W = 480;
const MIN_H = 320;

function readIndex(): SessionIndex[] {
  if (typeof document === "undefined") return [];
  const raw = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${COOKIE_KEY}=`))
    ?.split("=")[1];
  if (!raw) return [];
  try {
    return JSON.parse(decodeURIComponent(raw)) as SessionIndex[];
  } catch {
    return [];
  }
}

function writeIndex(list: SessionIndex[]) {
  const value = encodeURIComponent(JSON.stringify(list.slice(0, 30)));
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

export default function AgentClient() {
  const selectedHcpId = useHcpContext((s) => s.selectedHcpId);
  const selectedName = useHcpContext((s) => s.selectedName);
  const openTwins = useHcpContext((s) => s.openTwins);
  const hcpId = selectedHcpId ?? openTwins[0]?.hcpId ?? null;
  const displayName =
    selectedName ||
    openTwins.find((t) => t.hcpId === hcpId)?.name ||
    "未选定 HCP";

  const [index, setIndex] = useState<SessionIndex[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "我是 HCP Engagement Agent。可围绕当前 HCP 做访前问答；与一人一策页底修订模式分会话。正式外发仍须 MLR。",
    },
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

  useEffect(() => {
    setIndex(readIndex());
  }, []);

  const filteredIndex = useMemo(
    () => (hcpId ? index.filter((s) => s.hcpId === hcpId) : index),
    [index, hcpId],
  );

  const loadSession = useCallback(async (sessionId: string) => {
    const res = await fetch(
      `/api/engagement/sessions/${encodeURIComponent(sessionId)}`,
    );
    const data = await res.json();
    if (!res.ok || !data.session) return;
    setActiveId(sessionId);
    setMessages(
      (data.session.messages as ChatMsg[]).filter(
        (m) => m.role === "user" || m.role === "assistant",
      ),
    );
  }, []);

  const newSession = () => {
    setActiveId(null);
    setMessages([
      {
        role: "assistant",
        content: `新建开放对话（open_chat）。当前 HCP：${displayName}。`,
      },
    ]);
    setFiles([]);
  };

  const send = async () => {
    if (!draft.trim()) return;
    if (!hcpId) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "请先在「HCP数字分身」打开并选定一位 HCP。",
        },
      ]);
      return;
    }
    const text = draft.trim();
    const attachments = files.map((name) => ({
      name,
      summary: "用户上传附件元数据",
    }));
    setDraft("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, attachments },
    ]);
    setBusy(true);
    try {
      const res = await fetch("/api/engagement/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "open_chat",
          sessionId: activeId ?? undefined,
          hcpId,
          message: text,
          attachments: attachments.length ? attachments : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error?.message ?? "对话失败",
          },
        ]);
        return;
      }
      setActiveId(data.sessionId);
      const nextIndex: SessionIndex[] = [
        {
          sessionId: data.sessionId,
          title: `${displayName} · ${text.slice(0, 16)}`,
          hcpId,
        },
        ...index.filter((s) => s.sessionId !== data.sessionId),
      ];
      setIndex(nextIndex);
      writeIndex(nextIndex);
      const last = data.messages?.[data.messages.length - 1];
      if (last?.role === "assistant") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: last.content },
        ]);
      }
      setFiles([]);
    } finally {
      setBusy(false);
    }
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
        <p className="text-xs text-[var(--hca-ink-muted)]">
          HCP Engagement Agent
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight">
          开放对话
        </h1>
        <p className="text-sm text-[var(--hca-ink-muted)]">
          当前 HCP：{displayName}
          {hcpId ? `（hcp:${hcpId}）` : ""} · mode=open_chat
        </p>
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
          <p className="text-xs text-[var(--hca-ink-muted)]">历史（浏览器索引）</p>
          <ul className="space-y-1">
            {filteredIndex.map((s) => (
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
            {filteredIndex.length === 0 ? (
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
                placeholder="输入问题…"
                rows={2}
              />
              <button
                type="button"
                className="hca-btn-primary"
                disabled={busy || !draft.trim()}
                onClick={() => void send()}
              >
                发送
              </button>
            </div>
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
        面板最小 {MIN_W}×{MIN_H}；历史索引写入浏览器 cookie，消息正文在 Postgres。
      </p>
    </div>
  );
}
