import { describe, expect, it } from "vitest"

import {
  activeLeaderJob,
  leaderLineOptions,
  leaderLinePositions,
} from "@/lib/search/leaderLine"
import { LINE_MARKER_COLORS } from "@/lib/search/mapMarkers"
import type { SearchResult, SearchResultStation } from "@/lib/search/query"

/**
 * The leader line's pure logic (art_HltyfOl7 locked decision): geometry from
 * the active job's pin to its serving station, the ink-only styling with its
 * idle (dashed) and active (solid) states, and the never-always-on selection
 * rule. The overlay itself is declarative rendering — everything that can be
 * wrong lives here.
 */

function makeStation(overrides: Partial<SearchResultStation> = {}): SearchResultStation {
  return {
    stopId: "FIVE-POINTS",
    name: "FIVE POINTS STATION",
    lines: ["BLUE", "GOLD", "GREEN", "RED"],
    location: { lng: -84.39, lat: 33.755 },
    ...overrides,
  }
}

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Warehouse Lead",
    companyName: "Northstar Logistics",
    category: "Logistics & Warehouse",
    experienceLevel: "Entry level",
    salaryMin: 38_000,
    salaryMax: 45_000,
    addressText: "123 Peachtree St NE",
    location: { lng: -84.4, lat: 33.75 },
    station: makeStation(),
    miles: 0.6,
    walkMiles: 0.75,
    ...overrides,
  }
}

const OTHER_STATION = makeStation({
  stopId: "DECATUR",
  name: "DECATUR STATION",
  lines: ["BLUE"],
  location: { lng: -84.29, lat: 33.77 },
})

describe("leaderLinePositions", () => {
  it("runs from the job location to the job's serving station", () => {
    const job = makeResult()
    expect(leaderLinePositions(job)).toEqual([
      [33.75, -84.4],
      [33.755, -84.39],
    ])
  })

  it("lands on the station the rail row groups under, not some other station", () => {
    // The serving station is SearchResult.station — the query's nearest
    // station, which groupResultsByStation partitions by. A station existing
    // elsewhere in the fixture must not attract the line.
    const job = makeResult({ station: OTHER_STATION })
    const positions = leaderLinePositions(job)
    expect(positions?.[1]).toEqual([33.77, -84.29])
  })

  it("draws nothing when there is no active job — the deactivation cleanup", () => {
    expect(leaderLinePositions(null)).toBeNull()
    expect(leaderLinePositions(undefined)).toBeNull()
  })
})

describe("activeLeaderJob", () => {
  const SECOND_ID = "22222222-2222-2222-2222-222222222222"
  const results = [makeResult(), makeResult({ id: SECOND_ID })]

  it("selects the active job by id", () => {
    expect(activeLeaderJob(results, SECOND_ID)?.id).toBe(SECOND_ID)
  })

  it("selects nothing when the sync rests at null — the line is never always-on", () => {
    expect(activeLeaderJob(results, null)).toBeUndefined()
    expect(activeLeaderJob(results, undefined)).toBeUndefined()
  })

  it("selects nothing for an id that is not among the results", () => {
    expect(activeLeaderJob(results, "99999999-9999-9999-9999-999999999999")).toBeUndefined()
  })
})

describe("leaderLineOptions", () => {
  it("rests dashed while idle", () => {
    const options = leaderLineOptions("idle")
    expect(options.dashArray).toBeTruthy()
  })

  it("solidifies on direct engagement — no dash array", () => {
    const options = leaderLineOptions("active")
    expect(options.dashArray).toBeUndefined()
  })

  it("stays thin in both states", () => {
    expect(leaderLineOptions("idle").weight).toBeLessThanOrEqual(2)
    expect(leaderLineOptions("active").weight).toBeLessThanOrEqual(2)
  })

  it("is ink in both states — never a line hue (chroma means rail lines)", () => {
    const lineHues = Object.values(LINE_MARKER_COLORS)
    for (const state of ["idle", "active"] as const) {
      const options = leaderLineOptions(state)
      expect(options.color).toBe("#111827")
      expect(lineHues).not.toContain(options.color)
    }
  })
})
