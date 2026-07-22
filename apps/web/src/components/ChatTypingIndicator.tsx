"use client";

import { useT } from "@/i18n";

/** 对话等待回复时的轻量 typing 提示 */
export function ChatTypingIndicator({ label }: { label?: string }) {
  const tr = useT();
  const text = label ?? tr("agent.typing");
  return (
    <div
      className="flex items-center gap-2 border-l-2 border-[var(--hca-accent)] px-2.5 py-2 text-sm text-[var(--hca-ink-muted)]"
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      <span>{text}</span>
      <span className="hca-typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
