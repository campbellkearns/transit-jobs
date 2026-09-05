import type { jobStatus, MartaLine } from "@/db/schema"

export type JobStatus = (typeof jobStatus.enumValues)[number]

/**
 * A station associated with a job, as shown in the UI: the geodesic × 1.25
 * "≈ walk" estimate (never the employer's raw `walk_miles` claim — see
 * `getJobDetail`), computed fresh at read time.
 */
export type JobStationSummary = {
  stopId: string
  name: string
  lines: MartaLine[]
  walkMiles: number
}
