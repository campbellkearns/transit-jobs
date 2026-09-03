// @vitest-environment node
/**
 * Seeker search, against a real PostGIS database (DATABASE_URL, provisioned in
 * CI by .circleci/config.yml) — spec art_9CmAgRnh, deliverable 5.
 *
 * The fixture geometry is built by PostGIS itself: every station and job pin
 * is `ST_Project`ed a stated number of miles due north of one base point, so
 * the distances the assertions rely on are exact by construction rather than
 * approximated by hand-written latitudes. Laid out along a single meridian,
 * distances are additive and each expected result set can be read straight off
 * the diagram below.
 *
 *   4.00 mi ── RED station (RED, GOLD)
 *   3.70 mi ── job: Ticket Agent            (0.30 from RED)
 *   1.40 mi ── job: Line Cook               (1.10 from GREEN, 2.60 from RED)
 *   0.90 mi ── job: Warehouse Lead          (0.60 from GREEN, 0.90 from BLUE)
 *   0.50 mi ── job: Senior Analyst          (0.20 from GREEN, 0.50 from BLUE)
 *   0.10 mi ── job: Draft Role  [draft]
 *   0.30 mi ── GREEN station (GREEN)
 *   0.00 mi ── BLUE station (BLUE)          ← base point
 */
import { sql, type SQL } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { companies, jobs, jobStations, stations, users } from "@/db/schema"
import { METRES_PER_MILE } from "@/lib/search/distance"
import {
  DEFAULT_FILTERS,
  parseSearchFilters,
  type SearchFilters,
} from "@/lib/search/filters"
import { searchJobs, countPublishedJobs } from "@/lib/search/query"

import { connect, hasDatabase } from "../helpers/database"

const BASE_POINT = { lng: -84.4, lat: 33.75 }

const STATION = {
  blue: { stopId: "TEST-BLUE", name: "Fixture Blue", lines: ["BLUE"], miles: 0 },
  green: { stopId: "TEST-GREEN", name: "Fixture Green", lines: ["GREEN"], miles: 0.3 },
  red: { stopId: "TEST-RED", name: "Fixture Red", lines: ["RED", "GOLD"], miles: 4 },
} as const

type JobFixture = {
  key: string
  title: string
  description: string
  company: "acme" | "northstar"
  category: string
  experienceLevel: string
  salaryMin: number | null
  salaryMax: number | null
  milesNorth: number
  status: "draft" | "published"
}

const JOB_FIXTURES: JobFixture[] = [
  {
    key: "analyst",
    title: "Senior Analyst",
    description: "Own the reporting stack and the GTFS ingestion pipelines.",
    company: "acme",
    category: "Technology",
    experienceLevel: "Senior",
    salaryMin: 95_000,
    salaryMax: 120_000,
    milesNorth: 0.5,
    status: "published",
  },
  {
    key: "warehouse",
    title: "Warehouse Lead",
    description: "Run the inbound dock and the night crew.",
    company: "northstar",
    category: "Logistics & Warehouse",
    experienceLevel: "Entry level",
    salaryMin: 38_000,
    salaryMax: 45_000,
    milesNorth: 0.9,
    status: "published",
  },
  {
    key: "cook",
    title: "Line Cook",
    description: "Weekday lunch service for the commuter crowd.",
    company: "northstar",
    category: "Food Service",
    experienceLevel: "Entry level",
    salaryMin: 30_000,
    salaryMax: 34_000,
    milesNorth: 1.4,
    status: "published",
  },
  {
    key: "agent",
    title: "Ticket Agent",
    description: "Front-of-house support for riders and visitors.",
    company: "acme",
    category: "Customer Service",
    experienceLevel: "Mid level",
    // Deliberately unpriced: proves a salary filter excludes rows whose pay
    // is unknown rather than passing them through as if they qualified.
    salaryMin: null,
    salaryMax: null,
    milesNorth: 3.7,
    status: "published",
  },
  {
    key: "draft",
    title: "Draft Role",
    description: "Never published, never visible to a seeker.",
    company: "acme",
    category: "Technology",
    experienceLevel: "Senior",
    salaryMin: 95_000,
    salaryMax: 120_000,
    milesNorth: 0.1,
    status: "draft",
  },
]

describe.skipIf(!hasDatabase)("seeker search", () => {
  const { client, db } = hasDatabase ? connect() : ({} as ReturnType<typeof connect>)
  const jobIds = new Map<string, string>()

  /** Resolves fixture ids back to their keys, so failures read as job names. */
  function keysOf(results: { id: string }[]): string[] {
    const byId = new Map([...jobIds].map(([key, id]) => [id, key]))
    return results.map((result) => byId.get(result.id) ?? result.id)
  }

  function filters(overrides: Partial<SearchFilters> = {}): SearchFilters {
    return { ...DEFAULT_FILTERS, ...overrides }
  }

  /**
   * Moves an already-inserted row's pin `miles` due north of the base point.
   *
   * Rows are inserted at the base point through the schema's own geography
   * type and then projected by PostGIS, rather than having the insert compute
   * the geometry: it keeps the typed insert path (and its check constraints)
   * exercised, and `ST_Project` on the spheroid is what makes each stated
   * distance exact instead of a hand-converted latitude.
   */
  async function projectNorth(table: SQL, where: SQL, miles: number) {
    await db.execute(sql`
      update ${table}
      set location = st_project(
        location,
        ${miles * METRES_PER_MILE}::double precision,
        radians(0::double precision)
      )
      where ${where}
    `)
  }

  beforeAll(async () => {
    // job_stations references stations with ON DELETE RESTRICT, so it goes first.
    await db.delete(jobStations)
    await db.delete(jobs)
    await db.delete(companies)
    await db.delete(users)
    await db.delete(stations)

    for (const station of Object.values(STATION)) {
      await db.insert(stations).values({
        stopId: station.stopId,
        name: station.name,
        lines: [...station.lines],
        location: BASE_POINT,
      })
      await projectNorth(sql`stations`, sql`stop_id = ${station.stopId}`, station.miles)
    }

    const [employer] = await db
      .insert(users)
      .values({
        email: `search-fixture-${Date.now()}@example.test`,
        passwordHash: "not-a-real-hash",
        role: "employer",
      })
      .returning({ id: users.id })
    if (!employer) throw new Error("fixture employer was not inserted")

    const companyRows = await db
      .insert(companies)
      .values([
        { ownerId: employer.id, name: "Acme Transit Co" },
        { ownerId: employer.id, name: "Northstar Logistics" },
      ])
      .returning({ id: companies.id, name: companies.name })
    const companyId = {
      acme: companyRows.find((row) => row.name === "Acme Transit Co")?.id,
      northstar: companyRows.find((row) => row.name === "Northstar Logistics")?.id,
    }

    for (const fixture of JOB_FIXTURES) {
      const owner = companyId[fixture.company]
      if (!owner) throw new Error(`fixture company missing for ${fixture.key}`)

      const [row] = await db
        .insert(jobs)
        .values({
          employerId: employer.id,
          companyId: owner,
          title: fixture.title,
          description: fixture.description,
          category: fixture.category,
          experienceLevel: fixture.experienceLevel,
          salaryMin: fixture.salaryMin,
          salaryMax: fixture.salaryMax,
          addressText: `${fixture.milesNorth} mi north of ${STATION.blue.name}`,
          location: BASE_POINT,
          status: fixture.status,
        })
        .returning({ id: jobs.id })
      if (!row) throw new Error(`fixture job ${fixture.key} was not inserted`)

      await projectNorth(sql`jobs`, sql`id = ${row.id}`, fixture.milesNorth)
      jobIds.set(fixture.key, row.id)
    }

    // The analyst's employer associated only the Blue station, while the job's
    // pin actually sits nearer Green. The association exists to prove the
    // search ignores it: geometry decides, the employer's claim does not.
    const analystId = jobIds.get("analyst")
    if (!analystId) throw new Error("analyst fixture missing")
    await db.insert(jobStations).values({
      jobId: analystId,
      stationId: STATION.blue.stopId,
      walkMiles: "0.63",
    })
  })

  afterAll(async () => {
    await db.delete(jobStations)
    await db.delete(jobs)
    await db.delete(companies)
    await db.delete(users)
    await db.delete(stations)
    await client.end()
  })

  describe("radius", () => {
    it("defaults to one mile", () => {
      expect(DEFAULT_FILTERS.radiusMiles).toBe(1)
      expect(parseSearchFilters({}).radiusMiles).toBe(1)
    })

    it("excludes a job whose nearest station is 1.10 miles away", async () => {
      const results = await searchJobs(parseSearchFilters({}))
      expect(keysOf(results)).not.toContain("cook")
    })

    it("includes that job once widened to two miles", async () => {
      const results = await searchJobs(filters({ radiusMiles: 2 }))
      expect(keysOf(results)).toContain("cook")
    })

    it("measures the exact geodesic distance, not the employer's claim", async () => {
      const [nearest] = await searchJobs(filters())
      expect(nearest?.station.stopId).toBe(STATION.green.stopId)
      expect(nearest?.miles).toBeCloseTo(0.2, 3)
      // ≈ walk is the 1.25 display heuristic over that exact distance.
      expect(nearest?.walkMiles).toBeCloseTo(0.25, 2)
    })
  })

  describe("result set", () => {
    it("returns published jobs sorted by walking distance, nearest first", async () => {
      const results = await searchJobs(filters())
      expect(keysOf(results)).toEqual(["analyst", "agent", "warehouse"])

      const distances = results.map((result) => result.miles)
      expect(distances).toEqual([...distances].sort((a, b) => a - b))
    })

    it("never returns a draft, at any radius", async () => {
      const results = await searchJobs(filters({ radiusMiles: 3 }))
      expect(keysOf(results)).not.toContain("draft")
    })

    it("counts published jobs independently of the filters", async () => {
      expect(await countPublishedJobs()).toBe(4)
    })
  })

  describe("keyword", () => {
    it("matches the job title", async () => {
      const results = await searchJobs(filters({ keyword: "warehouse lead" }))
      expect(keysOf(results)).toEqual(["warehouse"])
    })

    it("matches the description", async () => {
      const results = await searchJobs(filters({ keyword: "gtfs" }))
      expect(keysOf(results)).toEqual(["analyst"])
    })

    it("matches the company name", async () => {
      const results = await searchJobs(filters({ keyword: "northstar" }))
      expect(keysOf(results)).toEqual(["warehouse"])
    })

    it("treats LIKE wildcards as literal characters", async () => {
      const results = await searchJobs(filters({ keyword: "%" }))
      expect(results).toHaveLength(0)
    })
  })

  describe("category", () => {
    it("returns only jobs in the selected category", async () => {
      const results = await searchJobs(filters({ category: "Technology" }))
      expect(keysOf(results)).toEqual(["analyst"])
    })
  })

  describe("experience level", () => {
    it("returns only jobs at the selected level", async () => {
      const results = await searchJobs(filters({ experienceLevel: "Entry level" }))
      expect(keysOf(results)).toEqual(["warehouse"])
    })
  })

  describe("MARTA line", () => {
    it("returns jobs near a station on the selected line", async () => {
      const results = await searchJobs(filters({ lines: ["RED"] }))
      expect(keysOf(results)).toEqual(["agent"])
    })

    it("treats a multi-line station as matching either of its lines", async () => {
      const results = await searchJobs(filters({ lines: ["GOLD"] }))
      expect(keysOf(results)).toEqual(["agent"])
    })

    it("unions the selected lines", async () => {
      const results = await searchJobs(filters({ lines: ["GREEN", "RED"] }))
      expect(keysOf(results)).toEqual(["analyst", "agent", "warehouse"])
    })

    it("names the nearest station that is actually on the selected line", async () => {
      const [analyst] = await searchJobs(filters({ lines: ["BLUE"] }))
      expect(analyst?.station.stopId).toBe(STATION.blue.stopId)
      expect(analyst?.miles).toBeCloseTo(0.5, 3)
    })

    it("re-ranks results against the filtered station set", async () => {
      const results = await searchJobs(filters({ lines: ["BLUE"] }))
      expect(keysOf(results)).toEqual(["analyst", "warehouse"])
    })
  })

  describe("salary range", () => {
    it("applies the floor against the top of the job's range", async () => {
      const results = await searchJobs(filters({ salaryMin: 90_000 }))
      expect(keysOf(results)).toEqual(["analyst"])
    })

    it("applies the ceiling against the bottom of the job's range", async () => {
      const results = await searchJobs(filters({ salaryMax: 50_000 }))
      expect(keysOf(results)).toEqual(["warehouse"])
    })

    it("excludes jobs with no salary recorded", async () => {
      const results = await searchJobs(filters({ salaryMin: 0 }))
      expect(keysOf(results)).not.toContain("agent")
    })
  })

  describe("combined filters", () => {
    it("intersects every axis at once", async () => {
      const results = await searchJobs(
        filters({
          keyword: "dock",
          category: "Logistics & Warehouse",
          experienceLevel: "Entry level",
          lines: ["GREEN"],
          radiusMiles: 1,
          salaryMin: 35_000,
          salaryMax: 50_000,
        }),
      )
      expect(keysOf(results)).toEqual(["warehouse"])
    })

    it("returns nothing when the axes cannot be satisfied together", async () => {
      const results = await searchJobs(
        filters({ category: "Technology", lines: ["RED"], radiusMiles: 3 }),
      )
      expect(results).toEqual([])
    })

    it("widening the radius recovers a combination that matched nothing", async () => {
      const narrow = await searchJobs(
        filters({ category: "Food Service", radiusMiles: 1 }),
      )
      expect(narrow).toEqual([])

      const widened = await searchJobs(
        filters({ category: "Food Service", radiusMiles: 2 }),
      )
      expect(keysOf(widened)).toEqual(["cook"])
    })
  })
})
