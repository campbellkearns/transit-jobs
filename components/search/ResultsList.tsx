import type { MartaLine } from "@/db/schema"
import { groupResultsByStation } from "@/lib/search/grouping"
import { stationLabel } from "@/lib/search/mapMarkers"
import type { SearchResult } from "@/lib/search/query"

import { JobRow } from "./JobRow"

/**
 * Static class map, not a template string: Tailwind scans source text for
 * complete class names, so `bg-line-${line}` would compile to nothing. Same
 * tokens LineBadge uses — the header shows the dots alone (the compact
 * treatment the station header wants) with the line names in the label.
 */
const LINE_DOT_CLASS: Record<MartaLine, string> = {
  BLUE: "bg-line-blue",
  GOLD: "bg-line-gold",
  GREEN: "bg-line-green",
  RED: "bg-line-red",
}

/**
 * One dot per serving line. Color never carries meaning alone, so the names
 * ride in the label a screen reader announces; the dots themselves are
 * decoration.
 */
function LineDots({ lines }: { lines: MartaLine[] }) {
  return (
    <span
      role="img"
      aria-label={`${lines.join(", ")} line${lines.length === 1 ? "" : "s"}`}
      className="flex items-center gap-1"
    >
      {lines.map((line) => (
        <span
          key={line}
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${LINE_DOT_CLASS[line]}`}
        />
      ))}
    </span>
  )
}

type ResultsListProps = {
  results: SearchResult[]
  radiusMiles: number
  /** The job highlighted on the map, when the map is shown beside this list. */
  activeJobId?: string | null
  /** Reports hover/focus on a row, to highlight the matching pin on the map. */
  onActiveJobChange?: (jobId: string | null) => void
}

/**
 * The results, grouped under closest-station headers.
 *
 * The count line states the radius as well as the number, because "12 jobs"
 * means nothing without the distance it was measured within — and the radius
 * is the filter a seeker is most likely to have changed without noticing.
 *
 * Stations are the list's structure, not its metadata: each station dense
 * enough to be one (MIN_GROUP_JOBS) becomes a section with its own heading,
 * line dots, and count, and the heading level is what a keyboard or
 * screen-reader user navigates the rail by. Jobs land in exactly one section
 * — the query's nearest station — so the Tab order is the grouped order and
 * hover/focus still syncs the map through the shared activeJobId.
 *
 * Stations too sparse for a section fold into a trailing "more stations"
 * list where each row names its own station again — slim rows everywhere
 * else would orphan those jobs from their geography.
 */
export function ResultsList({
  results,
  radiusMiles,
  activeJobId = null,
  onActiveJobChange,
}: ResultsListProps) {
  const { groups, sparse } = groupResultsByStation(results)

  const rowProps = (jobId: string) => ({
    active: jobId === activeJobId,
    onActiveChange: onActiveJobChange
      ? (active: boolean) => onActiveJobChange(active ? jobId : null)
      : undefined,
  })

  return (
    <div>
      <p role="status" className="px-4 py-3 text-sm text-ink-primary/70 sm:px-6">
        <span className="font-medium text-ink-primary tabular-nums">
          {results.length}
        </span>{" "}
        {results.length === 1 ? "job" : "jobs"} within {radiusMiles}{" "}
        {radiusMiles === 1 ? "mile" : "miles"} of a MARTA rail station, grouped by
        closest station
      </p>

      {groups.map((group) => {
        const headingId = `rail-station-${group.station.stopId}`
        return (
          <section
            key={group.station.stopId}
            aria-labelledby={headingId}
            className="border-t border-ink-primary/10"
          >
            <div className="flex items-center gap-2 px-4 pt-3 pb-1 sm:px-6">
              <h3
                id={headingId}
                className="text-xs font-semibold uppercase tracking-wider text-ink-primary"
              >
                {stationLabel(group.station.name)}
              </h3>
              <LineDots lines={group.station.lines} />
              <span className="ml-auto text-xs tabular-nums text-ink-primary/60">
                {group.jobs.length} {group.jobs.length === 1 ? "job" : "jobs"}
              </span>
            </div>
            <ul className="divide-y divide-ink-primary/10">
              {group.jobs.map((job) => (
                <JobRow key={job.id} job={job} {...rowProps(job.id)} />
              ))}
            </ul>
          </section>
        )
      })}

      {sparse.length > 0 && (
        <section
          aria-labelledby="rail-more-stations"
          className="border-t border-ink-primary/10"
        >
          <div className="px-4 pt-3 pb-1 sm:px-6">
            <h3
              id="rail-more-stations"
              className="text-xs font-semibold uppercase tracking-wider text-ink-primary/70"
            >
              More stations
            </h3>
          </div>
          <ul className="divide-y divide-ink-primary/10">
            {sparse.map((job) => (
              <JobRow key={job.id} job={job} showStation {...rowProps(job.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
