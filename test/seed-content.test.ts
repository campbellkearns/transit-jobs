// @vitest-environment node
//
// Database-backed coverage for seedEmployersAndJobs lives in test/seed.test.ts,
// not here: that file already owns sequential, non-concurrent access to the
// shared users/companies/jobs/job_stations tables (Vitest parallelizes across
// files by default, and two files independently wiping the same tables race
// each other). These are the pure-function pieces only.
import { describe, expect, it } from "vitest"

import { deterministicUuid, destinationPoint } from "@/db/seed-content"

describe("deterministicUuid", () => {
  it("is stable across calls for the same input", () => {
    expect(deterministicUuid("job:abc:Barista")).toBe(deterministicUuid("job:abc:Barista"))
  })

  it("differs for different input", () => {
    expect(deterministicUuid("job:abc:Barista")).not.toBe(deterministicUuid("job:abc:Cashier"))
  })

  it("produces a well-formed RFC 4122 v5 UUID", () => {
    const uuid = deterministicUuid("job:abc:Barista")
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})

describe("destinationPoint", () => {
  it("returns the origin for zero distance", () => {
    const origin = { lng: -84.39157, lat: 33.75387 }
    const point = destinationPoint(origin, 45, 0)
    expect(point.lng).toBeCloseTo(origin.lng, 6)
    expect(point.lat).toBeCloseTo(origin.lat, 6)
  })

  it("moves due north by the expected latitude delta", () => {
    const origin = { lng: -84.39157, lat: 33.75387 }
    const point = destinationPoint(origin, 0, 1)
    // 1 mile north is roughly 1/69.0 of a degree of latitude.
    expect(point.lat - origin.lat).toBeCloseTo(1 / 69.0, 2)
    expect(point.lng).toBeCloseTo(origin.lng, 3)
  })
})
