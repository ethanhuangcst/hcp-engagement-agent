type CareerNode = {
  title?: string;
  org?: string;
  as_of?: string;
  year?: string | number;
  kind?: string;
  role?: string;
};

function yearOf(n: CareerNode): string {
  if (n.year != null) return String(n.year);
  if (n.as_of) return n.as_of.slice(0, 4);
  return "—";
}

export function CareerTimeline({ career }: { career?: Record<string, unknown> }) {
  const nodes: CareerNode[] = [];
  const current = career?.positions_current;
  if (Array.isArray(current)) {
    for (const n of current) {
      if (n && typeof n === "object") nodes.push(n as CareerNode);
    }
  }
  const past = career?.positions_past;
  if (Array.isArray(past)) {
    for (const n of past) {
      if (n && typeof n === "object") nodes.push(n as CareerNode);
    }
  }
  const edu = career?.education;
  if (Array.isArray(edu)) {
    for (const n of edu) {
      if (n && typeof n === "object") {
        nodes.push({ ...(n as CareerNode), kind: "education" });
      }
    }
  }
  const society = career?.society_roles;
  if (Array.isArray(society)) {
    for (const n of society) {
      if (n && typeof n === "object") {
        nodes.push({ ...(n as CareerNode), kind: "society" });
      }
    }
  }

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-[var(--hca-ink-muted)]">
        暂无职业轨迹节点。确认保存后可由情报构建补齐（MVP-2）。
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {nodes.map((n, i) => {
        const role = n.title ?? n.role ?? "职位";
        const org = n.org ?? "";
        const last = i === nodes.length - 1;
        return (
          <div
            key={`${yearOf(n)}-${role}-${i}`}
            className="flex min-h-[52px] gap-3.5"
          >
            <div className="w-12 shrink-0 pt-0.5 text-right font-[family-name:var(--font-mono)] text-xs text-[var(--hca-ink-muted)]">
              {yearOf(n)}
            </div>
            <div className="relative flex w-3 shrink-0 justify-center">
              <div
                className="absolute top-0 w-px bg-[var(--hca-accent)] opacity-55"
                style={{ bottom: last ? 24 : 0 }}
              />
              <div className="z-[1] mt-[5px] h-1.5 w-1.5 rounded-full border border-[var(--hca-accent)] bg-[var(--hca-surface)]" />
            </div>
            <div className="flex-1 space-y-0.5 pb-4">
              <p className="text-[13px] font-medium">{role}</p>
              {org ? (
                <p className="text-xs text-[var(--hca-ink-muted)]">{org}</p>
              ) : null}
              {n.kind ? (
                <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hca-ink-muted)]">
                  {n.kind}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
