import type { SearchResult } from "@/lib/search/query"

import { JobRow } from "./JobRow"

type ResultsListProps = {
  results: SearchResult[]
  radiusMiles: number
  /** The job highlighted on the map, when the map is shown beside this list. */
  activeJobId?: string | null
  /** Reports hover/focus on a row, to highlight the matching pin on the map. */
  onActiveJobChange?: (jobId: string | null) => void
}

/**
 * The results, nearest station first.
 *
 * The count line states the radius as well as the number, because "12 jobs"
 * means nothing without the distance it was measured within — and the radius
 * is the filter a seeker is most likely to have changed without noticing.
 */
export function ResultsList({
  results,
  radiusMiles,
  activeJobId = null,
  onActiveJobChange,
}: ResultsListProps) {
  return (
    <div>
      <p role="status" className="px-4 py-3 text-sm text-ink-primary/70 sm:px-6">
        <span className="font-medium text-ink-primary tabular-nums">
          {results.length}
        </span>{" "}
        {results.length === 1 ? "job" : "jobs"} within {radiusMiles}{" "}
        {radiusMiles === 1 ? "mile" : "miles"} of a MARTA rail station, closest walk
        first
      </p>

      <ul className="divide-y divide-ink-primary/10 border-t border-ink-primary/10">
        {results.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            active={job.id === activeJobId}
            onActiveChange={
              onActiveJobChange
                ? (active: boolean) => onActiveJobChange(active ? job.id : null)
                : undefined
            }
          />
        ))}
      </ul>
    </div>
  )
}
