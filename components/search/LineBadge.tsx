import type { MartaLine } from "@/db/schema"

/**
 * Static class map, not a template string: Tailwind scans source text for
 * complete class names, so `bg-line-${line}` would compile to nothing.
 */
const LINE_DOT_CLASS: Record<MartaLine, string> = {
  BLUE: "bg-line-blue",
  GOLD: "bg-line-gold",
  GREEN: "bg-line-green",
  RED: "bg-line-red",
}

type LineBadgeProps = {
  line: MartaLine
  className?: string
}

/**
 * A MARTA line, as a colored dot beside its name.
 *
 * The name is always rendered (UI direction art_cJdHuq28): the hue describes
 * data rather than decorating it, and a dot alone would put the meaning
 * somewhere a colorblind or screen-reader user cannot reach.
 */
export function LineBadge({ line, className = "" }: LineBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-ink-primary ${className}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${LINE_DOT_CLASS[line]}`}
        aria-hidden="true"
      />
      {line}
    </span>
  )
}
