import Link from "next/link"
import type { JobStationSummary } from "@/lib/jobs/types"
import { StationChip } from "./StationChip"
import { WalkEstimate } from "./WalkEstimate"

type JobRowProps = {
  title: string
  companyName: string
  salaryLabel: string | null
  /** Sorted nearest-first; the row grammar surfaces only the nearest one. */
  stations: JobStationSummary[]
  /**
   * "compact" is the search-list grammar (role · company · salary ·
   * station · ≈ walk, whole row links to detail — UI direction component
   * inventory). "reading" is the same grammar at detail-page scale: no
   * link (the page is already the destination) and the title becomes the
   * page's `<h1>`.
   */
  size?: "compact" | "reading"
  href?: string
}

/**
 * The shared role · company · salary · station · ≈ walk grammar (UI
 * direction component inventory). T8 (this component's first consumer)
 * reuses it at reading size for the job detail header; the search list
 * (T6) reuses it at compact size as a linked row.
 */
export function JobRow({ title, companyName, salaryLabel, stations, size = "compact", href }: JobRowProps) {
  const nearest = stations[0]
  const isReading = size === "reading"
  const TitleTag = isReading ? "h1" : "p"

  const content = (
    <div className={isReading ? "flex flex-col gap-3" : "flex flex-col gap-1 py-3"}>
      <TitleTag className={isReading ? "text-4xl font-semibold text-ink-primary" : "text-base font-medium text-ink-primary"}>
        {title}
      </TitleTag>
      <div
        className={`flex flex-wrap items-center gap-2 text-ink-primary/80 ${
          isReading ? "text-base" : "text-sm"
        }`}
      >
        <span>{companyName}</span>
        {salaryLabel && (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{salaryLabel}</span>
          </>
        )}
        {nearest && (
          <>
            <span aria-hidden="true">·</span>
            <StationChip name={nearest.name} lines={nearest.lines} />
            <WalkEstimate miles={nearest.walkMiles} />
          </>
        )}
      </div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block border-b border-ink-primary/10 hover:bg-gray-50">
        {content}
      </Link>
    )
  }

  return content
}
