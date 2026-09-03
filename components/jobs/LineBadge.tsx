import type { MartaLine } from "@/db/schema"

const LINE_DOT_CLASS: Record<MartaLine, string> = {
  BLUE: "bg-line-blue",
  GOLD: "bg-line-gold",
  GREEN: "bg-line-green",
  RED: "bg-line-red",
}

/**
 * Colored dot + line name (UI direction component inventory). The name is
 * always rendered as text — the dot alone never carries the meaning, both
 * for the accessibility floor (no color-only meaning) and because MARTA's
 * trademark rules keep this product from presenting a line color as a logo.
 */
export function LineBadge({ line }: { line: MartaLine }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-primary/10 px-2 py-0.5 text-xs font-medium text-ink-primary">
      <span className={`h-2 w-2 rounded-full ${LINE_DOT_CLASS[line]}`} aria-hidden="true" />
      {line}
    </span>
  )
}
