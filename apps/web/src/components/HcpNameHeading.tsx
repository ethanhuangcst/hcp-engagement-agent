import { displayNameEn } from "@/lib/name-en";

/** Primary Chinese name with optional Given Family English (e.g. Changxi Wang). */
export function HcpNameHeading({
  nameZh,
  nameEn,
  as = "h1",
  className,
}: {
  nameZh: string;
  nameEn?: string | null;
  as?: "h1" | "span";
  className?: string;
}) {
  const en = displayNameEn(nameZh, nameEn);
  const Tag = as;
  return (
    <Tag className={className}>
      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span>{nameZh}</span>
        {en ? (
          <span className="text-[0.82em] font-normal text-[var(--hca-ink-muted)]">
            · {en}
          </span>
        ) : null}
      </span>
    </Tag>
  );
}
