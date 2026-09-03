import "server-only"
import { eq } from "drizzle-orm"
import { getDb } from "@/db"
import { companies, jobStations, jobs, stations, type MartaLine } from "@/db/schema"
import { walkEstimateMiles } from "@/lib/geo/distance"
import { isJobVisibleTo } from "./visibility"
import type { JobStationSummary, JobStatus } from "./types"

export type JobDetail = {
  id: string
  title: string
  description: string
  category: string
  experienceLevel: string
  salaryMin: number | null
  salaryMax: number | null
  addressText: string
  applyUrl: string | null
  status: JobStatus
  company: {
    name: string
    websiteUrl: string | null
    description: string | null
  }
  /** Every associated station, sorted nearest-first by ≈ walk estimate. */
  stations: JobStationSummary[]
}

/**
 * Loads a job for the detail page, or `null` if it doesn't exist *or* the
 * viewer isn't allowed to see it — the two cases are indistinguishable on
 * purpose (`isJobVisibleTo`), so a non-owner probing a draft's id gets the
 * same 404 as a made-up id.
 *
 * The ≈ walk figure is always computed geodesically here, never read from
 * `job_stations.walk_miles` (the employer's own claim at publish time) —
 * the spec reserves that column for the T4 publish-time validation and
 * requires the display estimate to be computed at read time.
 */
export async function getJobDetail(
  jobId: string,
  viewerId: string | undefined,
): Promise<JobDetail | null> {
  const db = getDb()

  const [job] = await db
    .select({
      id: jobs.id,
      employerId: jobs.employerId,
      title: jobs.title,
      description: jobs.description,
      category: jobs.category,
      experienceLevel: jobs.experienceLevel,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      addressText: jobs.addressText,
      location: jobs.location,
      applyUrl: jobs.applyUrl,
      status: jobs.status,
      companyName: companies.name,
      companyWebsiteUrl: companies.websiteUrl,
      companyDescription: companies.description,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .limit(1)

  if (!job || !isJobVisibleTo(job, viewerId)) {
    return null
  }

  const stationRows = await db
    .select({
      stopId: stations.stopId,
      name: stations.name,
      lines: stations.lines,
      location: stations.location,
    })
    .from(jobStations)
    .innerJoin(stations, eq(jobStations.stationId, stations.stopId))
    .where(eq(jobStations.jobId, jobId))

  const stationSummaries: JobStationSummary[] = stationRows
    .map((station) => ({
      stopId: station.stopId,
      name: station.name,
      // The seed guarantees `lines` is always a subset of MARTA_LINES
      // (db/schema.ts) — stored as a plain text array because a new line is
      // a data change, not a migration.
      lines: station.lines as MartaLine[],
      walkMiles: walkEstimateMiles(job.location, station.location),
    }))
    .sort((a, b) => a.walkMiles - b.walkMiles)

  return {
    id: job.id,
    title: job.title,
    description: job.description,
    category: job.category,
    experienceLevel: job.experienceLevel,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    addressText: job.addressText,
    applyUrl: job.applyUrl,
    status: job.status,
    company: {
      name: job.companyName,
      websiteUrl: job.companyWebsiteUrl,
      description: job.companyDescription,
    },
    stations: stationSummaries,
  }
}
