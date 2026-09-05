import { describe, expect, it } from "vitest"
import { geodesicMiles, walkEstimateMiles } from "@/lib/geo/distance"

// Two points on the same meridian: the great-circle path between them *is*
// the meridian, so the distance is exactly radius × Δlat (in radians) — a
// closed-form fact independent of the haversine implementation under test,
// which is what makes this a "known coordinate pair" rather than a
// restatement of the code being tested.
const EARTH_RADIUS_MILES = 3958.7613
const FIVE_POINTS = { lng: -84.3917, lat: 33.7537 }
const ONE_DEGREE_NORTH = { lng: -84.3917, lat: 34.7537 }
const EXPECTED_MERIDIAN_DEGREE_MILES = EARTH_RADIUS_MILES * (Math.PI / 180)

describe("geodesicMiles", () => {
  it("matches the exact great-circle distance for a known pair one degree of latitude apart", () => {
    expect(geodesicMiles(FIVE_POINTS, ONE_DEGREE_NORTH)).toBeCloseTo(
      EXPECTED_MERIDIAN_DEGREE_MILES,
      6,
    )
  })

  it("is symmetric", () => {
    expect(geodesicMiles(FIVE_POINTS, ONE_DEGREE_NORTH)).toBeCloseTo(
      geodesicMiles(ONE_DEGREE_NORTH, FIVE_POINTS),
      10,
    )
  })

  it("is zero for identical points", () => {
    expect(geodesicMiles(FIVE_POINTS, FIVE_POINTS)).toBe(0)
  })
})

describe("walkEstimateMiles", () => {
  it("applies the 1.25 detour factor and rounds to hundredths, per the spec's reference SQL", () => {
    const expected = Math.round(EXPECTED_MERIDIAN_DEGREE_MILES * 1.25 * 100) / 100
    expect(walkEstimateMiles(FIVE_POINTS, ONE_DEGREE_NORTH)).toBe(expected)
  })

  it("is always at least the geodesic distance, since the detour factor is > 1", () => {
    const geodesic = geodesicMiles(FIVE_POINTS, ONE_DEGREE_NORTH)
    expect(walkEstimateMiles(FIVE_POINTS, ONE_DEGREE_NORTH)).toBeGreaterThan(geodesic)
  })
})
