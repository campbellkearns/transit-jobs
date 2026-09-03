import type { SearchResult } from "@/lib/search/query"

import { JobRow } from "./JobRow"

type ResultsListProps = {
  results: SearchResult[]
  radiusMiles: number
}

/**
 * The results, nearest station first.
 *
 * The count line states the radius as well as the number, because "12 jobs"
 * means nothing without the distance it was measured within — and the radius
 * is the filter a seeker is most likely to have changed without noticing.
 */
export function ResultsList({ results, radiusMiles }: ResultsListProps) {
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
          <JobRow key={job.id} job={job} />
        ))}
      </ul>
    </div>
  )
}
