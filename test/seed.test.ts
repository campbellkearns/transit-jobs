// @vitest-environment node
import { count, eq, inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EXPECTED_STATION_COUNT, SEC_DISTRICT_STOP_ID } from "@/db/gtfs"
import { toPointEwkt } from "@/db/postgis"
import { loadPinnedStations, seedStations } from "@/db/seed"
import { FICTIONAL_EMPLOYERS, JOB_FIXTURES, seedEmployersAndJobs } from "@/db/seed-content"
import { companies, jobs, jobStations, MARTA_LINES, stations, users } from "@/db/schema"

import { connect, hasDatabase, violatedConstraint } from "./helpers/database"

const ONE_MILE_METRES = 1609.344
// MARTA-adjacent real employer names that must never appear in seeded content
// — seeding a real company's name would imply an opening that doesn't exist.
const REAL_COMPANY_NAMES = ["MARTA", "Delta", "Coca-Cola", "Home Depot", "UPS"]

describe.skipIf(!hasDatabase)("station seed", () => {
  const { client, db } = hasDatabase ? connect() : ({} as ReturnType<typeof connect>)

  beforeAll(async () => {
    // Order matters: job_stations references stations with ON DELETE RESTRICT.
    await db.delete(jobStations)
    await db.delete(jobs)
    await db.delete(companies)
    await db.delete(users)
    await db.delete(stations)
  })

  afterAll(async () => {
    await client.end()
  })

  it("writes exactly 38 rail stations", async () => {
    const result = await seedStations(db, await loadPinnedStations())
    expect(result.stationCount).toBe(EXPECTED_STATION_COUNT)
  })

  it("is idempotent — a second run neither duplicates nor changes rows", async () => {
    const before = await db.select().from(stations).orderBy(stations.stopId)

    const second = await seedStations(db, await loadPinnedStations())
    expect(second.stationCount).toBe(EXPECTED_STATION_COUNT)
    expect(second.removedCount).toBe(0)

    const after = await db.select().from(stations).orderBy(stations.stopId)
    expect(after).toEqual(before)
  })

  it("maps station 510039 to BLUE and GREEN", async () => {
    const [station] = await db
      .select()
      .from(stations)
      .where(eq(stations.stopId, SEC_DISTRICT_STOP_ID))
    expect(station?.lines).toEqual(["BLUE", "GREEN"])
  })

  it("stores no park-and-ride lots", async () => {
    const [row] = await db
      .select({ value: count() })
      .from(stations)
      .where(sql`${stations.name} ilike '%park%ride%'`)
    expect(row?.value).toBe(0)
  })

  it("round-trips coordinates through the geography column", async () => {
    const derived = (await loadPinnedStations()).find(
      (station) => station.stopId === SEC_DISTRICT_STOP_ID,
    )
    const [stored] = await db
      .select()
      .from(stations)
      .where(eq(stations.stopId, SEC_DISTRICT_STOP_ID))

    expect(stored?.location.lng).toBeCloseTo(derived?.location.lng ?? 0, 6)
    expect(stored?.location.lat).toBeCloseTo(derived?.location.lat ?? 0, 6)
  })

  it("stores locations as WGS84 points, so distances come back in metres", async () => {
    const [row] = await db.execute<{ srid: number; gtype: string; metres: number }>(sql`
      select
        st_srid(${stations.location}) as srid,
        st_geometrytype(${stations.location}::geometry) as gtype,
        st_distance(
          ${stations.location},
          ${sql.raw(`'SRID=4326;POINT(-84.39157 33.75387)'::geography`)}
        ) as metres
      from ${stations}
      where ${eq(stations.stopId, SEC_DISTRICT_STOP_ID)}
    `)

    expect(row?.srid).toBe(4326)
    expect(row?.gtype).toBe("ST_Point")
    // SEC District to Five Points is a little over a third of a mile.
    expect(Number(row?.metres)).toBeGreaterThan(400)
    expect(Number(row?.metres)).toBeLessThan(800)
  })

  it("removes a station that has dropped out of the feed", async () => {
    await db.insert(stations).values({
      stopId: "999999",
      name: "CLOSED STATION",
      lines: ["RED"],
      location: { lng: -84.4, lat: 33.8 },
    })
    expect(await countStations()).toBe(EXPECTED_STATION_COUNT + 1)

    const result = await seedStations(db, await loadPinnedStations())
    expect(result.removedCount).toBe(1)
    expect(result.stationCount).toBe(EXPECTED_STATION_COUNT)
  })

  async function countStations() {
    const [row] = await db.select({ value: count() }).from(stations)
    return row?.value ?? 0
  }
})

describe.skipIf(!hasDatabase)("schema constraints", () => {
  const { client, db } = hasDatabase ? connect() : ({} as ReturnType<typeof connect>)

  let jobId = ""
  let otherStationId = ""

  beforeAll(async () => {
    const pinned = await loadPinnedStations()
    await seedStations(db, pinned)
    otherStationId =
      pinned.find((station) => station.stopId !== SEC_DISTRICT_STOP_ID)?.stopId ?? ""

    const [user] = await db
      .insert(users)
      .values({
        email: "Employer@Example.com",
        passwordHash: "not-a-real-hash",
        role: "employer",
      })
      .returning()
    const [company] = await db
      .insert(companies)
      .values({ ownerId: user!.id, name: "Peachtree Widgets" })
      .returning()
    const [job] = await db
      .insert(jobs)
      .values({
        employerId: user!.id,
        companyId: company!.id,
        title: "Line Cook",
        description: "Kitchen work near the station.",
        category: "Food Service",
        experienceLevel: "Entry",
        addressText: "100 Centennial Olympic Park Dr NW",
        location: { lng: -84.3947, lat: 33.7573 },
        status: "published",
      })
      .returning()
    jobId = job!.id
  })

  afterAll(async () => {
    await db.delete(jobStations)
    await db.delete(jobs)
    await db.delete(companies)
    await db.delete(users)
    await client.end()
  })

  it("rejects a second user whose email differs only by case", async () => {
    const constraint = await violatedConstraint(
      db.insert(users).values({
        email: "employer@example.com",
        passwordHash: "x",
        role: "seeker",
      }),
    )
    expect(constraint).toBe("users_email_lower_idx")
  })

  it("accepts a walk distance within one mile", async () => {
    await db
      .insert(jobStations)
      .values({ jobId, stationId: SEC_DISTRICT_STOP_ID, walkMiles: "0.30" })

    const [row] = await db
      .select()
      .from(jobStations)
      .where(eq(jobStations.jobId, jobId))
    expect(row?.walkMiles).toBe("0.30")
  })

  it("rejects a walk distance beyond one mile", async () => {
    const constraint = await violatedConstraint(
      db.insert(jobStations).values({ jobId, stationId: otherStationId, walkMiles: "1.40" }),
    )
    expect(constraint).toBe("job_stations_walk_miles_within_one")
  })

  it("rejects a non-positive walk distance", async () => {
    const constraint = await violatedConstraint(
      db.insert(jobStations).values({ jobId, stationId: otherStationId, walkMiles: "0.00" }),
    )
    expect(constraint).toBe("job_stations_walk_miles_within_one")
  })

  it("refuses to delete a station a job still points at", async () => {
    const constraint = await violatedConstraint(
      db.delete(stations).where(eq(stations.stopId, SEC_DISTRICT_STOP_ID)),
    )
    expect(constraint).toBe("job_stations_station_id_stations_stop_id_fk")
  })

  it("rejects a job location that is not a point", async () => {
    const constraint = await violatedConstraint(
      db.execute(sql`
        update ${jobs}
        set ${sql.raw(`"location"`)} = ${sql.raw(`'SRID=4326;LINESTRING(-84.4 33.7,-84.3 33.8)'::geography`)}
        where ${eq(jobs.id, jobId)}
      `),
    )
    expect(constraint).toBe("jobs_location_is_wgs84_point")
  })

  it("finds a job within a one-mile radius of a station and excludes one beyond it", async () => {
    const [station] = await db
      .select()
      .from(stations)
      .where(eq(stations.stopId, SEC_DISTRICT_STOP_ID))
    const origin = toPointEwkt(station!.location)

    const near = await db.execute<{ id: string }>(sql`
      select ${jobs.id} as id from ${jobs}
      where st_dwithin(
        ${jobs.location},
        ${sql.raw(`'${origin}'::geography`)},
        ${sql.raw(String(ONE_MILE_METRES))}
      )
    `)
    expect(near.map((row) => row.id)).toContain(jobId)

    const far = await db.execute<{ id: string }>(sql`
      select ${jobs.id} as id from ${jobs}
      where st_dwithin(
        ${jobs.location},
        ${sql.raw(`'SRID=4326;POINT(-84.5482 33.7899)'::geography`)},
        ${sql.raw(String(ONE_MILE_METRES))}
      )
    `)
    expect(far.map((row) => row.id)).not.toContain(jobId)
  })
})

describe.skipIf(!hasDatabase)("employer and job content seed", () => {
  const { client, db } = hasDatabase ? connect() : ({} as ReturnType<typeof connect>)

  beforeAll(async () => {
    // Order matters: job_stations references stations with ON DELETE RESTRICT,
    // and jobs/companies reference users. Stations are reseeded rather than
    // assumed present, so this block is self-sufficient if run in isolation.
    await db.delete(jobStations)
    await db.delete(jobs)
    await db.delete(companies)
    await db.delete(users)
    await seedStations(db, await loadPinnedStations())
  })

  afterAll(async () => {
    await client.end()
  })

  it("publishes at least 20 jobs across at least 8 stations and all 4 lines", async () => {
    const result = await seedEmployersAndJobs(db)
    expect(result.jobCount).toBeGreaterThanOrEqual(20)

    const publishedJobs = await db.select().from(jobs).where(eq(jobs.status, "published"))
    expect(publishedJobs.length).toBeGreaterThanOrEqual(20)

    const associations = await db.select({ stationId: jobStations.stationId }).from(jobStations)
    const distinctStationIds = new Set(associations.map((row) => row.stationId))
    expect(distinctStationIds.size).toBeGreaterThanOrEqual(8)

    const usedStations = await db
      .select()
      .from(stations)
      .where(inArray(stations.stopId, Array.from(distinctStationIds)))
    const coveredLines = new Set(usedStations.flatMap((station) => station.lines))
    for (const line of MARTA_LINES) {
      expect(coveredLines).toContain(line)
    }
  })

  it("uses no real company names", async () => {
    const companyRows = await db.select({ name: companies.name }).from(companies)
    const seededNames = companyRows.map((row) => row.name)
    for (const realName of REAL_COMPANY_NAMES) {
      expect(seededNames).not.toContain(realName)
    }
    // Every seeded company should also be traceable back to the fixture list,
    // not just absent from a denylist.
    const fixtureNames = new Set(FICTIONAL_EMPLOYERS.map((employer) => employer.companyName))
    for (const name of seededNames) {
      expect(fixtureNames).toContain(name)
    }
  })

  it("places every job within one mile of each of its station associations", async () => {
    const rows = await db
      .select({
        jobLocation: jobs.location,
        stationLocation: stations.location,
      })
      .from(jobStations)
      .innerJoin(jobs, eq(jobs.id, jobStations.jobId))
      .innerJoin(stations, eq(stations.stopId, jobStations.stationId))

    expect(rows.length).toBe(JOB_FIXTURES.length)

    for (const row of rows) {
      const [distanceRow] = await db.execute<{ metres: number }>(sql`
        select st_distance(
          ${sql.raw(`'${toPointEwkt(row.jobLocation)}'::geography`)},
          ${sql.raw(`'${toPointEwkt(row.stationLocation)}'::geography`)}
        ) as metres
      `)
      expect(Number(distanceRow?.metres)).toBeLessThanOrEqual(ONE_MILE_METRES)
    }
  })

  it("is idempotent — a second run does not duplicate employers, companies, or jobs", async () => {
    const beforeCompanies = await db.select().from(companies).orderBy(companies.id)
    const beforeJobs = await db.select().from(jobs).orderBy(jobs.id)
    const beforeUsers = await db.select().from(users).orderBy(users.id)
    const beforeAssociations = await db.select().from(jobStations)

    const second = await seedEmployersAndJobs(db)
    expect(second.jobCount).toBe(JOB_FIXTURES.length)
    expect(second.companyCount).toBe(FICTIONAL_EMPLOYERS.length)

    const afterCompanies = await db.select().from(companies).orderBy(companies.id)
    const afterJobs = await db.select().from(jobs).orderBy(jobs.id)
    const afterUsers = await db.select().from(users).orderBy(users.id)
    const afterAssociations = await db.select().from(jobStations)

    expect(afterCompanies.length).toBe(beforeCompanies.length)
    expect(afterJobs.length).toBe(beforeJobs.length)
    expect(afterUsers.length).toBe(beforeUsers.length)
    expect(afterAssociations.length).toBe(beforeAssociations.length)
    expect(afterCompanies.map((row) => row.id)).toEqual(beforeCompanies.map((row) => row.id))
    expect(afterJobs.map((row) => row.id)).toEqual(beforeJobs.map((row) => row.id))
  })
})
