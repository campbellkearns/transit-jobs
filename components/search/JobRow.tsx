import Link from "next/link"

import { formatSalaryRange } from "@/lib/jobs/format"
import { formatWalkEstimate } from "@/lib/search/distance"
import { stationLabel } from "@/lib/search/mapMarkers"
import type { SearchResult } from "@/lib/search/query"

/** Visual separator between metadata items; the list is read as one line. */
function Dot() {
  return (
    <span aria-hidden="true" className="text-ink-primary/25">
      ·
    </span>
  )
}

type JobRowProps = {
  job: SearchResult
  /** Highlighted because the matching pin is active on the map (T7 sync). */
  active?: boolean
  /** Reports hover/focus so the map can highlight this job's pin. */
  onActiveChange?: (active: boolean) => void
  /**
   * Rows in the "more stations" tail stand outside every station section,
   * so they carry the station their group header would have. Grouped rows
   * omit it: the header above them already says where they are.
   */
  showStation?: boolean
}

/**
 * One result: role · company · salary · ≈ walk.
 *
 * The order is the UI direction's (art_cJdHuq28) and it is the order a seeker
 * scans in — what the job is, who it is with, what it pays, and only then how
 * far it is from the train. Salary and distance are `tabular-nums` so the
 * digits line up down the column and the list can be compared by eye.
 *
 * The station name and its line badges are not in the row: the station is
 * now the structure of the list (the section header above), not row
 * metadata. The walk figure carries "≈" because it is the ×1.25 estimate,
 * not the geodesic distance the results were filtered and sorted by.
 */
export function JobRow({
  job,
  active = false,
  onActiveChange,
  showStation = false,
}: JobRowProps) {
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax)

  const reportActive = (next: boolean) => () => onActiveChange?.(next)

  return (
    <li>
      <Link
        href={`/jobs/${job.id}`}
        onMouseEnter={reportActive(true)}
        onMouseLeave={reportActive(false)}
        onFocus={reportActive(true)}
        onBlur={reportActive(false)}
        data-active={active || undefined}
        className={`block px-4 py-3 hover:bg-ink-primary/[0.03] focus-visible:bg-ink-primary/[0.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-primary sm:px-6 ${
          active ? "bg-ink-primary/[0.05]" : ""
        }`}
      >
        {/* h4: the station header above it is the h3 of this section. */}
        <h4 className="text-base font-semibold text-ink-primary">{job.title}</h4>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-primary/70">
          <span>{job.companyName}</span>
          {showStation && (
            <>
              <Dot />
              <span className="text-ink-primary">{stationLabel(job.station.name)}</span>
            </>
          )}
          <Dot />
          <span className="tabular-nums">
            {salary ?? <span className="italic">Salary not listed</span>}
          </span>
          <Dot />
          <span className="tabular-nums">{formatWalkEstimate(job.walkMiles)}</span>
        </div>
      </Link>
    </li>
  )
}
