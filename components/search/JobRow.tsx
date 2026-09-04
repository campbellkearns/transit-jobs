import Link from "next/link"

import { formatSalaryRange } from "@/lib/jobs/format"
import { formatWalkEstimate } from "@/lib/search/distance"
import type { SearchResult } from "@/lib/search/query"

import { LineBadge } from "./LineBadge"

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
}

/**
 * One result: role · company · salary · station · ≈ walk.
 *
 * The order is the UI direction's (art_cJdHuq28) and it is the order a seeker
 * scans in — what the job is, who it is with, what it pays, and only then how
 * far it is from the train. Salary and distance are `tabular-nums` so the
 * digits line up down the column and the list can be compared by eye.
 *
 * The walk figure carries "≈" because it is the ×1.25 estimate, not the
 * geodesic distance the results were filtered and sorted by.
 */
export function JobRow({ job, active = false, onActiveChange }: JobRowProps) {
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
        className={`block px-4 py-4 hover:bg-ink-primary/[0.03] focus-visible:bg-ink-primary/[0.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-primary sm:px-6 ${
          active ? "bg-ink-primary/[0.05]" : ""
        }`}
      >
        <h3 className="text-base font-semibold text-ink-primary">{job.title}</h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-primary/70">
          <span>{job.companyName}</span>
          <Dot />
          <span className="tabular-nums">
            {salary ?? <span className="italic">Salary not listed</span>}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-primary/70">
          <span className="text-ink-primary">{job.station.name}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {job.station.lines.map((line) => (
              <LineBadge key={line} line={line} />
            ))}
          </span>
          <Dot />
          <span className="tabular-nums">{formatWalkEstimate(job.walkMiles)}</span>
        </div>
      </Link>
    </li>
  )
}
