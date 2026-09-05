import type { MartaLine } from "@/db/schema"
import { LineBadge } from "./LineBadge"

type StationChipProps = {
  name: string
  lines: MartaLine[]
}

/** Station name + its LineBadges (UI direction component inventory). */
export function StationChip({ name, lines }: StationChipProps) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-medium text-ink-primary">{name}</span>
      {lines.map((line) => (
        <LineBadge key={line} line={line} />
      ))}
    </span>
  )
}
