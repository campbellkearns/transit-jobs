import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  assertStationInvariants,
  deriveRailStations,
  EXPECTED_STATION_COUNT,
  parseCsv,
  readGtfsFeed,
  SEC_DISTRICT_STOP_ID,
  type GtfsFeed,
  type StationRecord,
} from "@/db/gtfs"

const feed: GtfsFeed = readGtfsFeed(
  readFileSync(path.join(process.cwd(), "gtfs", "google_transit.zip")),
)
const stations = deriveRailStations(feed)
const byId = new Map(stations.map((station) => [station.stopId, station]))

describe("parseCsv", () => {
  it("keeps commas inside quoted fields", () => {
    const rows = parseCsv('stop_id,stop_name\r\n1,"HAMILTON E HOLMES STATION, WEST"\r\n')
    expect(rows).toEqual([{ stop_id: "1", stop_name: "HAMILTON E HOLMES STATION, WEST" }])
  })

  it("unescapes doubled quotes", () => {
    const rows = parseCsv('a\r\n"say ""hi"""\r\n')
    expect(rows[0]?.a).toBe('say "hi"')
  })

  it("tolerates a UTF-8 BOM on the header", () => {
    const rows = parseCsv('\ufeffstop_id\r\n510039\r\n')
    expect(rows[0]?.stop_id).toBe("510039")
  })

  it("does not emit a row for the trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toHaveLength(1)
  })

  it("fills missing trailing columns rather than returning undefined", () => {
    expect(parseCsv("a,b,c\r\n1,2\r\n")[0]).toEqual({ a: "1", b: "2", c: "" })
  })
})

describe("deriveRailStations", () => {
  it("derives exactly the 38 MARTA rail stations", () => {
    expect(stations).toHaveLength(EXPECTED_STATION_COUNT)
  })

  it("keys stations on stop_id, with no duplicates", () => {
    expect(new Set(stations.map((s) => s.stopId)).size).toBe(stations.length)
  })

  it("resolves platform-level child stops to their parent station", () => {
    // Rail stop_times only ever reference platform children, so every derived
    // id must be a parent_station — i.e. carry location_type=1. A seed that
    // skipped this step would return ~81 platform rows instead.
    const stops = new Map(feed.stops.map((stop) => [stop.stop_id, stop]))
    for (const station of stations) {
      expect(stops.get(station.stopId)?.location_type).toBe("1")
    }
  })

  it("excludes park-and-ride lots", () => {
    // These carry location_type=1 and look exactly like stations in stops.txt;
    // they are absent because no rail trip calls at them.
    expect(stations.filter((s) => /PARK\s*&\s*RIDE/i.test(s.name))).toEqual([])

    const parkAndRideStops = feed.stops.filter(
      (stop) => stop.location_type === "1" && /PARK\s*&\s*RIDE/i.test(stop.stop_name ?? ""),
    )
    expect(parkAndRideStops.length).toBeGreaterThan(0)
    for (const stop of parkAndRideStops) {
      expect(byId.has(stop.stop_id ?? "")).toBe(false)
    }
  })

  it("excludes the Atlanta Streetcar, which is not rail", () => {
    const streetcarRouteIds = new Set(
      feed.routes.filter((route) => route.route_type === "0").map((route) => route.route_id),
    )
    expect(streetcarRouteIds.size).toBeGreaterThan(0)

    const streetcarTripIds = new Set(
      feed.trips
        .filter((trip) => streetcarRouteIds.has(trip.route_id ?? ""))
        .map((trip) => trip.trip_id),
    )
    const streetcarStopIds = new Set(
      feed.stopTimes
        .filter((stopTime) => streetcarTripIds.has(stopTime.trip_id ?? ""))
        .map((stopTime) => stopTime.stop_id ?? ""),
    )
    expect(streetcarStopIds.size).toBeGreaterThan(0)
    for (const stopId of streetcarStopIds) {
      expect(byId.has(stopId)).toBe(false)
    }
  })

  it("assigns BLUE and GREEN to SEC District (510039)", () => {
    expect(byId.get(SEC_DISTRICT_STOP_ID)?.lines).toEqual(["BLUE", "GREEN"])
  })

  it("assigns all four lines to Five Points, the system's only interchange", () => {
    const fourLine = stations.filter((s) => s.lines.length === 4)
    expect(fourLine).toHaveLength(1)
    expect(fourLine[0]?.lines).toEqual(["BLUE", "GOLD", "GREEN", "RED"])
    expect(fourLine[0]?.name).toMatch(/FIVE POINTS/i)
  })

  it("assigns every station at least one known MARTA line", () => {
    for (const station of stations) {
      expect(station.lines.length).toBeGreaterThan(0)
      expect(station.lines).toEqual([...station.lines].sort())
      for (const line of station.lines) {
        expect(["BLUE", "GOLD", "GREEN", "RED"]).toContain(line)
      }
    }
  })

  it("places every station inside metro Atlanta", () => {
    for (const { location } of stations) {
      expect(location.lat).toBeGreaterThan(33.5)
      expect(location.lat).toBeLessThan(34.1)
      expect(location.lng).toBeGreaterThan(-84.6)
      expect(location.lng).toBeLessThan(-84.2)
    }
  })

  it("returns a deterministic order, so re-seeding is comparable", () => {
    const again = deriveRailStations(feed).map((s) => s.stopId)
    expect(again).toEqual(stations.map((s) => s.stopId))
    expect(again).toEqual([...again].sort())
  })

  it("raises rather than guessing when stop_times references an unknown stop", () => {
    const railRouteIds = new Set(
      feed.routes.filter((route) => route.route_type === "1").map((route) => route.route_id),
    )
    const railTripIds = new Set(
      feed.trips.filter((trip) => railRouteIds.has(trip.route_id ?? "")).map((trip) => trip.trip_id),
    )
    const referenced = feed.stopTimes.find((stopTime) => railTripIds.has(stopTime.trip_id ?? ""))
      ?.stop_id
    expect(referenced).toBeTruthy()

    const broken: GtfsFeed = {
      ...feed,
      stops: feed.stops.filter((stop) => stop.stop_id !== referenced),
    }
    expect(() => deriveRailStations(broken)).toThrow(/unknown stop_id/)
  })

  it("raises when the feed has no rail routes at all", () => {
    const busOnly: GtfsFeed = {
      ...feed,
      routes: feed.routes.filter((route) => route.route_type !== "1"),
    }
    expect(() => deriveRailStations(busOnly)).toThrow(/no rail routes/)
  })
})

describe("assertStationInvariants", () => {
  it("accepts the pinned feed", () => {
    expect(() => assertStationInvariants(stations)).not.toThrow()
  })

  it("rejects a short station set", () => {
    expect(() => assertStationInvariants(stations.slice(1))).toThrow(/Expected 38/)
  })

  it("rejects a park-and-ride that slipped through", () => {
    const withLot: StationRecord[] = [
      ...stations.slice(1),
      { stopId: "x", name: "BROWNS MILL PARK & RIDE", lines: ["RED"], location: { lng: -84.4, lat: 33.7 } },
    ]
    expect(() => assertStationInvariants(withLot)).toThrow(/Park-and-ride/)
  })

  it("rejects a wrong line assignment for SEC District", () => {
    const mislabelled = stations.map((station) =>
      station.stopId === SEC_DISTRICT_STOP_ID ? { ...station, lines: ["BLUE"] } : station,
    )
    expect(() => assertStationInvariants(mislabelled)).toThrow(/should serve BLUE,GREEN/)
  })
})
