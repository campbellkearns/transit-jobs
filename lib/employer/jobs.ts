import "server-only"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { getDb } from "@/db"
import { toPointEwkt, type LngLat } from "@/db/postgis"
import { jobs, jobStations, jobStatus, stations } from "@/db/schema"
import { getOrCreateCompany } from "./company"
import type { JobInput } from "./validation"

/**
 * The one-mile boundary, in metres. `1609.344` (not the rounder `1609.34`)
 * matches the constant `test/seed.test.ts` already uses for the same
 * `ST_DWithin` radius, so a job sitting exactly on the line is judged the
 * same way everywhere it's checked.
 */
export const ONE_MILE_METERS = 1609.344

export type JobStatus = (typeof jobStatus.enumValues)[number]

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`No job with id "${jobId}".`)
    this.name = "JobNotFoundError"
  }
}

export class ForbiddenJobAccessError extends Error {
  constructor() {
    super("This job belongs to a different employer.")
    this.name = "ForbiddenJobAccessError"
  }
}

export type StationViolation = { stationId: string; stationName: string; distanceMiles: number }

export class PublishValidationError extends Error {
  constructor(public readonly violations: StationViolation[]) {
    super(
      violations.length > 0
        ? "One or more selected stations are more than one mile from the pin."
        : "Select at least one station before publishing.",
    )
    this.name = "PublishValidationError"
  }
}

type StationAssociationRow = {
  stationId: string
  stationName: string
  lines: string[]
  walkMiles: string
}

export type EmployerJobView = {
  id: string
  title: string
  description: string
  category: string
  experienceLevel: string
  salaryMin: number | null
  salaryMax: number | null
  addressText: string
  pin: LngLat
  applyUrl: string | null
  status: JobStatus
  stations: { stationId: string; stationName: string; lines: string[]; walkMiles: number }[]
  createdAt: string
  updatedAt: string
}

function serializeJob(
  job: typeof jobs.$inferSelect,
  associations: StationAssociationRow[],
): EmployerJobView {
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    category: job.category,
    experienceLevel: job.experienceLevel,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    addressText: job.addressText,
    pin: job.location,
    applyUrl: job.applyUrl,
    status: job.status,
    stations: associations.map((row) => ({
      stationId: row.stationId,
      stationName: row.stationName,
      lines: row.lines,
      walkMiles: Number(row.walkMiles),
    })),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  }
}

async function fetchStationAssociations(jobId: string): Promise<StationAssociationRow[]> {
  const db = getDb()
  return db
    .select({
      stationId: stations.stopId,
      stationName: stations.name,
      lines: stations.lines,
      walkMiles: jobStations.walkMiles,
    })
    .from(jobStations)
    .innerJoin(stations, eq(jobStations.stationId, stations.stopId))
    .where(eq(jobStations.jobId, jobId))
    .orderBy(stations.name)
}

/**
 * Replaces a job's station associations wholesale — the form always saves
 * its full local list rather than diffing. `Tx` is left generic (rather than
 * named as `PostgresJsTransaction<...>`) purely so both `getDb()` and a
 * `db.transaction` callback's `tx` satisfy it without a cast.
 */
async function writeStationAssociations<
  Tx extends { delete: ReturnType<typeof getDb>["delete"]; insert: ReturnType<typeof getDb>["insert"] },
>(tx: Tx, jobId: string, associations: JobInput["stations"]) {
  await tx.delete(jobStations).where(eq(jobStations.jobId, jobId))
  if (associations.length === 0) return

  await tx.insert(jobStations).values(
    associations.map((association) => ({
      jobId,
      stationId: association.stationId,
      walkMiles: association.walkMiles.toFixed(2),
    })),
  )
}

/**
 * Throws `JobNotFoundError`/`ForbiddenJobAccessError` without returning the
 * row — exported so routes can check ownership before touching the request
 * body, not just internally inside `updateJob`. Permission belongs before
 * payload validation: an outsider's malformed edit to someone else's job
 * must still surface as 403, not a 400 that validates content they were
 * never authorized to change.
 */
export async function assertJobOwnedByEmployer(jobId: string, employerId: string): Promise<void> {
  await requireOwnedJob(jobId, employerId)
}

async function requireOwnedJob(jobId: string, employerId: string) {
  const db = getDb()
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId))
  if (!job) throw new JobNotFoundError(jobId)
  if (job.employerId !== employerId) throw new ForbiddenJobAccessError()
  return job
}

export async function createDraftJob(employerId: string, input: JobInput): Promise<string> {
  const db = getDb()
  const company = await getOrCreateCompany(employerId)

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(jobs)
      .values({
        employerId,
        companyId: company.id,
        title: input.title,
        description: input.description,
        category: input.category,
        experienceLevel: input.experienceLevel,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        addressText: input.addressText,
        location: input.pin,
        applyUrl: input.applyUrl ?? null,
      })
      .returning({ id: jobs.id })

    if (!row) throw new Error("Insert returned no row")
    await writeStationAssociations(tx, row.id, input.stations)
    return row.id
  })
}

export async function getEmployerJob(jobId: string, employerId: string): Promise<EmployerJobView> {
  const job = await requireOwnedJob(jobId, employerId)
  return serializeJob(job, await fetchStationAssociations(jobId))
}

export async function listEmployerJobs(employerId: string): Promise<EmployerJobView[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.employerId, employerId))
    .orderBy(desc(jobs.updatedAt))

  return Promise.all(rows.map(async (job) => serializeJob(job, await fetchStationAssociations(job.id))))
}

/**
 * Edit is unconditional — create/edit/publish/unpublish are independent
 * actions (spec deliverable 4), and only `publishJob` checks the pin against
 * the stations. Editing a published job's stations without republishing
 * can leave it out of compliance until the next publish; that's the
 * documented `unpublish → edit → publish` path, not a gap in this one.
 */
export async function updateJob(
  jobId: string,
  employerId: string,
  input: JobInput,
): Promise<EmployerJobView> {
  const db = getDb()
  await requireOwnedJob(jobId, employerId)

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(jobs)
      .set({
        title: input.title,
        description: input.description,
        category: input.category,
        experienceLevel: input.experienceLevel,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        addressText: input.addressText,
        location: input.pin,
        applyUrl: input.applyUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId))
      .returning()

    if (!row) throw new Error("Update returned no row")
    await writeStationAssociations(tx, jobId, input.stations)
    return row
  })

  return serializeJob(updated, await fetchStationAssociations(jobId))
}

export async function publishJob(jobId: string, employerId: string): Promise<EmployerJobView> {
  const db = getDb()
  const job = await requireOwnedJob(jobId, employerId)
  const associations = await fetchStationAssociations(jobId)

  if (associations.length === 0) {
    throw new PublishValidationError([])
  }

  const violations = await findStationsBeyondOneMile(
    job.location,
    associations.map((association) => association.stationId),
  )
  if (violations.length > 0) {
    throw new PublishValidationError(violations)
  }

  const [updated] = await db
    .update(jobs)
    .set({ status: "published", updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
    .returning()

  if (!updated) throw new Error("Update returned no row")
  return serializeJob(updated, associations)
}

export async function unpublishJob(jobId: string, employerId: string): Promise<EmployerJobView> {
  const db = getDb()
  await requireOwnedJob(jobId, employerId)

  const [updated] = await db
    .update(jobs)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
    .returning()

  if (!updated) throw new Error("Update returned no row")
  return serializeJob(updated, await fetchStationAssociations(jobId))
}

/**
 * The pin is the coordinate of record (spec deliverable 4): this checks it
 * against every one of the given stations — by exact geodesic distance,
 * never the employer's own `walkMiles` claim — and returns every station
 * further than one mile away, not just the first, so the inline error can
 * name every offending pair at once.
 *
 * Filters on `st_distance(...) > ONE_MILE_METERS` rather than the more
 * obvious `not st_dwithin(...)`: PostGIS's geography `ST_DWithin` treats the
 * boundary as exclusive (a pin measured at exactly 1609.344m reports
 * `st_distance = 1609.344` but `st_dwithin(..., 1609.344) = false`), which
 * would reject a pin sitting precisely at the one-mile line the spec says
 * must publish. Comparing the exact metre distance directly is inclusive,
 * as "≤ 1.00 mile" requires.
 */
export async function findStationsBeyondOneMile(
  pin: LngLat,
  stationIds: string[],
): Promise<StationViolation[]> {
  if (stationIds.length === 0) return []
  const db = getDb()
  const pinEwkt = toPointEwkt(pin)

  const rows = await db
    .select({
      stationId: stations.stopId,
      stationName: stations.name,
      distanceMiles: sql<string>`round((st_distance(${stations.location}, ${pinEwkt}::geography) * 0.000621371)::numeric, 2)`,
    })
    .from(stations)
    .where(
      and(
        inArray(stations.stopId, stationIds),
        sql`st_distance(${stations.location}, ${pinEwkt}::geography) > ${ONE_MILE_METERS}`,
      ),
    )

  return rows.map((row) => ({ ...row, distanceMiles: Number(row.distanceMiles) }))
}

// Draft-job visibility for seekers is T8's existing `lib/jobs/visibility.ts`
// + `getJobDetail`, which already gates on this same `status` column — no
// second implementation belongs here. `test/integration/employer-jobs.test.ts`
// exercises the seam directly: publish/unpublish through this module, then
// assert `getJobDetail` flips visibility accordingly.
