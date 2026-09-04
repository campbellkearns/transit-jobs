// @vitest-environment node
/**
 * Integration tests against the real employer job route handlers and a real
 * Postgres database (DATABASE_URL, provisioned in CI by
 * .circleci/config.yml) — spec art_9CmAgRnh, deliverable 4.
 *
 * Follows `test/integration/search.test.ts`'s convention for the tables this
 * suite shares with every other integration file: own them for the
 * duration of the suite, wipe clean in `beforeAll` and `afterAll`, and never
 * assume another file's fixtures (or a real `db:seed`) are present. Users
 * are created through the real register/login flow (this suite's own
 * concern, not the database's), the same way `test/integration/auth.test.ts`
 * does.
 */
import { randomUUID } from "crypto"
import { sql } from "drizzle-orm"
import { NextRequest } from "next/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { GET as authGet, POST as authPost } from "@/app/api/auth/[...nextauth]/route"
import { GET as getJobRoute, PATCH as patchJobRoute } from "@/app/api/employer/jobs/[id]/route"
import { POST as publishJobRoute } from "@/app/api/employer/jobs/[id]/publish/route"
import { POST as unpublishJobRoute } from "@/app/api/employer/jobs/[id]/unpublish/route"
import { GET as listJobsRoute, POST as createJobRoute } from "@/app/api/employer/jobs/route"
import { POST as registerRoute } from "@/app/api/register/route"
import { companies, jobs, jobStations, stations, users } from "@/db/schema"
import { ONE_MILE_METERS } from "@/lib/employer/jobs"
import { getJobDetail } from "@/lib/jobs/getJobDetail"

import { connect, hasDatabase } from "../helpers/database"
import { pinAtDistanceFromStation } from "../helpers/geo"

const BASE_URL = "http://localhost:3000"
const BASE_POINT = { lng: -84.4, lat: 33.75 }

/** A station near `BASE_POINT`; job pins in these tests are projected from it. */
const NEAR_STATION = { stopId: "TEST-EMP-NEAR", name: "Fixture Near", lines: ["BLUE"] as const }
/** 10 miles north of `BASE_POINT` — far enough that any pin near it is always a violation. */
const FAR_STATION = { stopId: "TEST-EMP-FAR", name: "Fixture Far", lines: ["RED"] as const }

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.test`
}

function extractCookies(response: Response): Record<string, string> {
  const jar: Record<string, string> = {}
  for (const setCookie of response.headers.getSetCookie()) {
    const pair = setCookie.split(";")[0] ?? ""
    const [name, ...rest] = pair.split("=")
    if (name) jar[name.trim()] = rest.join("=")
  }
  return jar
}

function cookieHeader(jar: Record<string, string>) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")
}

async function registerAndSignIn(role: "employer" | "seeker", label: string) {
  const email = uniqueEmail(label)
  const password = "correct-password-1"

  const registerResponse = await registerRoute(
    new NextRequest(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    }),
  )
  const { user } = (await registerResponse.json()) as { user: { id: string } }

  const csrfResponse = await authGet(new NextRequest(`${BASE_URL}/api/auth/csrf`))
  const csrfCookies = extractCookies(csrfResponse)
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string }

  const loginResponse = await authPost(
    new NextRequest(`${BASE_URL}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader(csrfCookies),
      },
      body: new URLSearchParams({ email, password, csrfToken, redirect: "false", json: "true" }),
    }),
  )

  const cookies = { ...csrfCookies, ...extractCookies(loginResponse) }
  return { userId: user.id, cookies }
}

type RequestOptions = { method?: string; body?: string; headers?: Record<string, string> }

function authedRequest(path: string, cookies: Record<string, string>, options: RequestOptions = {}) {
  return new NextRequest(`${BASE_URL}${path}`, {
    method: options.method,
    body: options.body,
    headers: {
      ...options.headers,
      Cookie: cookieHeader(cookies),
      // auth()'s session decode builds its own internal request URL from
      // these, the same way a real edge network always sets them before
      // middleware runs (see test/integration/auth.test.ts's callMiddleware) —
      // without them a bare NextRequest resolves to no session at all.
      "x-forwarded-proto": "http",
      "x-forwarded-host": "localhost:3000",
    },
  })
}

/**
 * Auth.js's `AppRouteHandlerFn` type always allows `void` (a handler is
 * permitted to fall through) and always requires a `ctx` second argument,
 * even for routes with no dynamic segment (`ctx.params` is just unused).
 * This narrows both away in one place instead of at every call site.
 */
async function invoke(
  handler: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => void | Response | Promise<void | Response>,
  req: NextRequest,
  params: Record<string, string> = {},
): Promise<Response> {
  const result = await handler(req, { params: Promise.resolve(params) })
  if (!result) throw new Error("route handler returned no response")
  return result
}

type JobPayload = {
  title: string
  description: string
  category: string
  experienceLevel: string
  salaryMin?: number | null
  salaryMax?: number | null
  addressText: string
  pin: { lng: number; lat: number }
  applyUrl?: string | null
  stations: { stationId: string; walkMiles: number }[]
}

function jobPayload(overrides: Partial<JobPayload>): JobPayload {
  return {
    title: "Warehouse Associate",
    description: "Pack and ship orders.",
    category: "Logistics",
    experienceLevel: "Entry level",
    addressText: "123 Fixture Ave, Atlanta, GA",
    pin: BASE_POINT,
    stations: [],
    ...overrides,
  }
}

async function createDraftJob(cookies: Record<string, string>, payload: JobPayload) {
  const response = await invoke(
    createJobRoute,
    authedRequest("/api/employer/jobs", cookies, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  )
  const body = (await response.json()) as { id?: string; error?: string }
  if (response.status !== 201 || !body.id) {
    throw new Error(`fixture job creation failed: ${response.status} ${JSON.stringify(body)}`)
  }
  return body.id
}

describe.skipIf(!hasDatabase)("employer job management", () => {
  const { client, db } = hasDatabase ? connect() : ({} as ReturnType<typeof connect>)

  beforeAll(async () => {
    // job_stations references stations with ON DELETE RESTRICT, so it goes first.
    await db.delete(jobStations)
    await db.delete(jobs)
    await db.delete(companies)
    await db.delete(users)
    await db.delete(stations)

    await db.insert(stations).values([
      { stopId: NEAR_STATION.stopId, name: NEAR_STATION.name, lines: [...NEAR_STATION.lines], location: BASE_POINT },
      { stopId: FAR_STATION.stopId, name: FAR_STATION.name, lines: [...FAR_STATION.lines], location: BASE_POINT },
    ])
    // Move FAR ten miles north — far enough from BASE_POINT that any pin
    // projected a mile or two off NEAR_STATION is still nowhere close to it.
    await db.execute(sql`
      update stations
      set location = st_project(location, ${10 * ONE_MILE_METERS}::double precision, radians(0::double precision))
      where stop_id = ${FAR_STATION.stopId}
    `)
  })

  afterAll(async () => {
    await db.delete(jobStations)
    await db.delete(jobs)
    await db.delete(companies)
    await db.delete(users)
    await db.delete(stations)
    await client.end()
  })

  it("creates a draft, lists it for its owner, and keeps it out of the public job detail view", async () => {
    const { userId, cookies } = await registerAndSignIn("employer", "draft-owner")
    const id = await createDraftJob(cookies, jobPayload({ stations: [{ stationId: NEAR_STATION.stopId, walkMiles: 0.5 }] }))

    const listResponse = await invoke(listJobsRoute, authedRequest("/api/employer/jobs", cookies))
    const { jobs: listed } = (await listResponse.json()) as { jobs: { id: string; status: string }[] }
    expect(listed.map((job) => job.id)).toContain(id)
    expect(listed.find((job) => job.id === id)?.status).toBe("draft")

    // Drafts 404 to seekers (spec deliverable 4) — T8's own visibility gate,
    // exercised here at the seam this suite owns: does publish/unpublish
    // actually flip it?
    expect(await getJobDetail(id, undefined)).toBeNull()
    expect(await getJobDetail(id, userId)).not.toBeNull()
  })

  it("publishes when every associated station is within one mile of the pin, and appears in the dashboard", async () => {
    const { cookies } = await registerAndSignIn("employer", "boundary-pass")
    const pin = await pinAtDistanceFromStation(db, NEAR_STATION.stopId, ONE_MILE_METERS)
    const id = await createDraftJob(
      cookies,
      jobPayload({ pin, stations: [{ stationId: NEAR_STATION.stopId, walkMiles: 1.0 }] }),
    )

    const response = await invoke(publishJobRoute, authedRequest(`/api/employer/jobs/${id}/publish`, cookies, { method: "POST" }), { id })
    const body = (await response.json()) as { job: { status: string } }

    expect(response.status).toBe(200)
    expect(body.job.status).toBe("published")

    const listResponse = await invoke(listJobsRoute, authedRequest("/api/employer/jobs", cookies))
    const { jobs: listed } = (await listResponse.json()) as { jobs: { id: string; status: string }[] }
    expect(listed.find((job) => job.id === id)?.status).toBe("published")
  })

  it("rejects a pin 1.01 miles from its only station, naming that station, and leaves the job a draft", async () => {
    const { cookies } = await registerAndSignIn("employer", "boundary-fail")
    const pin = await pinAtDistanceFromStation(db, NEAR_STATION.stopId, ONE_MILE_METERS * 1.01)
    const id = await createDraftJob(
      cookies,
      jobPayload({ pin, stations: [{ stationId: NEAR_STATION.stopId, walkMiles: 1.0 }] }),
    )

    const response = await invoke(publishJobRoute, authedRequest(`/api/employer/jobs/${id}/publish`, cookies, { method: "POST" }), { id })
    const body = (await response.json()) as {
      error: string
      violations: { stationId: string; stationName: string; distanceMiles: number }[]
    }

    expect(response.status).toBe(422)
    expect(body.violations).toHaveLength(1)
    expect(body.violations[0]).toMatchObject({ stationId: NEAR_STATION.stopId, stationName: NEAR_STATION.name })
    expect(body.violations[0]?.distanceMiles).toBeCloseTo(1.01, 1)

    const jobResponse = await invoke(getJobRoute, authedRequest(`/api/employer/jobs/${id}`, cookies), { id })
    const { job } = (await jobResponse.json()) as { job: { status: string } }
    expect(job.status).toBe("draft")
    expect(await getJobDetail(id, undefined)).toBeNull()
  })

  it("names only the offending station when one of several is beyond one mile", async () => {
    const { cookies } = await registerAndSignIn("employer", "partial-violation")
    // Exactly at the boundary for NEAR; FAR_STATION sits ~10 miles away, so
    // it is always a violation regardless of azimuth choice above.
    const pin = await pinAtDistanceFromStation(db, NEAR_STATION.stopId, ONE_MILE_METERS)
    const id = await createDraftJob(
      cookies,
      jobPayload({
        pin,
        stations: [
          { stationId: NEAR_STATION.stopId, walkMiles: 1.0 },
          { stationId: FAR_STATION.stopId, walkMiles: 1.0 },
        ],
      }),
    )

    const response = await invoke(publishJobRoute, authedRequest(`/api/employer/jobs/${id}/publish`, cookies, { method: "POST" }), { id })
    const body = (await response.json()) as { violations: { stationId: string }[] }

    expect(response.status).toBe(422)
    expect(body.violations.map((violation) => violation.stationId)).toEqual([FAR_STATION.stopId])
  })

  it("returns a published job to draft on unpublish, hiding it from seekers again", async () => {
    const { cookies } = await registerAndSignIn("employer", "unpublish")
    const pin = await pinAtDistanceFromStation(db, NEAR_STATION.stopId, ONE_MILE_METERS)
    const id = await createDraftJob(
      cookies,
      jobPayload({ pin, stations: [{ stationId: NEAR_STATION.stopId, walkMiles: 1.0 }] }),
    )
    await invoke(publishJobRoute, authedRequest(`/api/employer/jobs/${id}/publish`, cookies, { method: "POST" }), { id })
    expect(await getJobDetail(id, undefined)).not.toBeNull()

    const response = await invoke(unpublishJobRoute, authedRequest(`/api/employer/jobs/${id}/unpublish`, cookies, { method: "POST" }), { id })
    const body = (await response.json()) as { job: { status: string } }

    expect(response.status).toBe(200)
    expect(body.job.status).toBe("draft")
    expect(await getJobDetail(id, undefined)).toBeNull()
  })

  it("returns 403 when an employer edits or reads another employer's job", async () => {
    const owner = await registerAndSignIn("employer", "owner")
    const outsider = await registerAndSignIn("employer", "outsider")
    const id = await createDraftJob(
      owner.cookies,
      jobPayload({ stations: [{ stationId: NEAR_STATION.stopId, walkMiles: 0.5 }] }),
    )

    const readResponse = await invoke(getJobRoute, authedRequest(`/api/employer/jobs/${id}`, outsider.cookies), { id })
    expect(readResponse.status).toBe(403)

    const editResponse = await invoke(
      patchJobRoute,
      authedRequest(`/api/employer/jobs/${id}`, outsider.cookies, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobPayload({ title: "Hijacked title" })),
      }),
      { id },
    )
    expect(editResponse.status).toBe(403)

    const publishResponse = await invoke(
      publishJobRoute,
      authedRequest(`/api/employer/jobs/${id}/publish`, outsider.cookies, { method: "POST" }),
      { id },
    )
    expect(publishResponse.status).toBe(403)
  })

  it("rejects a payload with no stations selected, before ever touching the database", async () => {
    const { cookies } = await registerAndSignIn("employer", "no-stations")
    const response = await invoke(
      createJobRoute,
      authedRequest("/api/employer/jobs", cookies, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobPayload({ stations: [] })),
      }),
    )
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/at least one station/i)
  })

  it("rejects a seeker's attempt to create a job", async () => {
    const { cookies } = await registerAndSignIn("seeker", "not-an-employer")
    const response = await invoke(
      createJobRoute,
      authedRequest("/api/employer/jobs", cookies, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobPayload({ stations: [{ stationId: NEAR_STATION.stopId, walkMiles: 0.5 }] })),
      }),
    )
    expect(response.status).toBe(403)
  })
})
