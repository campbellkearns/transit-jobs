import type { SearchResult, SearchResultStation } from "./query"

/** One closest-station section of the rail: the station and the jobs under it. */
export type StationGroup = {
  station: SearchResultStation
  jobs: SearchResult[]
}

export type GroupedResults = {
  /** Stations with at least `minGroupJobs` jobs, in first-appearance order. */
  groups: StationGroup[]
  /** Jobs whose nearest station fell below the threshold, in result order. */
  sparse: SearchResult[]
}

/**
 * Fewer jobs than this and a station cannot carry a section of its own.
 *
 * Chosen against the seeded catalog, which is the only distribution on hand:
 * 24 jobs spread over 18 nearest stations (six with 2 jobs, twelve with 1).
 * A header for every station would outnumber the jobs it introduces, so
 * single-station jobs fold into the rail's tail instead.
 */
export const MIN_GROUP_JOBS = 2

/**
 * Groups the results under each job's closest station.
 *
 * The query (`searchJobs`) already assigns every result its one nearest
 * station — the lateral join orders candidates by distance and takes a
 * single row — so this is a partition by that station's id, not a
 * recomputation: no geometry is consulted here, and a job near two stations
 * can only ever land in one bucket, the one the query named.
 *
 * Groups come out in first-appearance order, which for the query's
 * nearest-first results reads as "stations ordered by their closest job";
 * jobs inside a group keep the query's order (closest walk first). Stations
 * with fewer than `minGroupJobs` jobs are too sparse to be structure —
 * their jobs fold into `sparse`, still in result order, for the rail's
 * trailing "more stations" section where each row carries its own station.
 */
export function groupResultsByStation(
  results: SearchResult[],
  minGroupJobs: number = MIN_GROUP_JOBS,
): GroupedResults {
  const byStation = new Map<string, StationGroup>()
  for (const job of results) {
    const existing = byStation.get(job.station.stopId)
    if (existing) existing.jobs.push(job)
    else byStation.set(job.station.stopId, { station: job.station, jobs: [job] })
  }

  const groups: StationGroup[] = []
  for (const group of byStation.values()) {
    if (group.jobs.length >= minGroupJobs) groups.push(group)
  }

  // Sparse jobs are filtered out of the original array rather than collected
  // during the walk above: a station can hold several jobs when the caller
  // raises the threshold, and only the original order is order-faithful.
  const groupedStopIds = new Set(groups.map((group) => group.station.stopId))
  const sparse = results.filter((job) => !groupedStopIds.has(job.station.stopId))

  return { groups, sparse }
}
