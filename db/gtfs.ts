import { unzipSync } from "fflate"

import type { LngLat } from "./postgis"

/**
 * Deriving the station table from the GTFS feed is the one place the feed's
 * quirks are handled, so the rest of the app can treat `stations` as plain
 * reference data. Everything here is a pure function over parsed rows: the
 * seed supplies the bytes and writes the result, and the tests exercise the
 * join against the pinned feed without needing a database.
 */

export type GtfsRow = Record<string, string>

/** `route_type` values, per the GTFS spec. Rail is what this product means by transit. */
export const RAIL_ROUTE_TYPE = "1"

/**
 * Invariants asserted after every seed. They encode what the feed looked like
 * when it was pinned (see gtfs/README.md); if MARTA opens a line or renames a
 * station, the seed should fail loudly rather than quietly reshape the table
 * that every job association points at.
 */
export const EXPECTED_STATION_COUNT = 38
export const SEC_DISTRICT_STOP_ID = "510039"
export const SEC_DISTRICT_LINES = ["BLUE", "GREEN"] as const

export type StationRecord = {
  stopId: string
  name: string
  lines: string[]
  location: LngLat
}

/**
 * Minimal RFC 4180 CSV reader for GTFS text files.
 *
 * GTFS files are CRLF-terminated, may carry a UTF-8 BOM, and quote any field
 * containing a comma — MARTA's `stop_name` and `stop_desc` both do — so
 * splitting on commas corrupts the columns after them.
 */
export function parseCsv(text: string): GtfsRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const endField = () => {
    row.push(field)
    field = ""
  }
  const endRow = () => {
    endField()
    // A trailing newline would otherwise yield a final row of one empty field.
    if (row.length > 1 || row[0] !== "") rows.push(row)
    row = []
  }

  for (let i = 0; i < body.length; i++) {
    const char = body[i]
    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') quoted = true
    else if (char === ",") endField()
    else if (char === "\n") endRow()
    else if (char !== "\r") field += char
  }
  if (field !== "" || row.length > 0) endRow()

  const header = rows.shift()
  if (!header) return []

  return rows.map((values) => {
    const record: GtfsRow = {}
    header.forEach((column, index) => {
      record[column] = values[index] ?? ""
    })
    return record
  })
}

export type GtfsFeed = {
  routes: GtfsRow[]
  trips: GtfsRow[]
  stopTimes: GtfsRow[]
  stops: GtfsRow[]
}

const REQUIRED_FILES = ["routes.txt", "trips.txt", "stop_times.txt", "stops.txt"] as const

/** Reads the four files the station join needs out of a GTFS zip. */
export function readGtfsFeed(zipBytes: Uint8Array): GtfsFeed {
  const archive = unzipSync(zipBytes, {
    filter: (file) => REQUIRED_FILES.includes(file.name as (typeof REQUIRED_FILES)[number]),
  })

  const decoder = new TextDecoder("utf-8")
  const read = (name: (typeof REQUIRED_FILES)[number]): GtfsRow[] => {
    const bytes = archive[name]
    if (!bytes) {
      throw new Error(`GTFS archive is missing ${name}`)
    }
    return parseCsv(decoder.decode(bytes))
  }

  return {
    routes: read("routes.txt"),
    trips: read("trips.txt"),
    stopTimes: read("stop_times.txt"),
    stops: read("stops.txt"),
  }
}

/**
 * Reduces a GTFS feed to the rail stations a seeker can walk from.
 *
 * The join has to go the long way round — routes to trips to stop_times to
 * stops — because nothing on a stop record marks it as rail. It is served by a
 * rail trip or it is not, and that is only visible through stop_times. Two
 * consequences fall out of doing it this way:
 *
 * - Park-and-ride lots drop out on their own. They carry `location_type=1` and
 *   look exactly like stations in stops.txt, but no rail trip stops at them, so
 *   they never enter the set.
 * - The Atlanta Streetcar is excluded, being `route_type=0` rather than `1`.
 *
 * Rail stop_times reference platform-level children, so each is resolved to its
 * `parent_station`; a direct join on station ids returns nothing at all.
 */
export function deriveRailStations(feed: GtfsFeed): StationRecord[] {
  const lineByRouteId = new Map<string, string>()
  for (const route of feed.routes) {
    if (route.route_type === RAIL_ROUTE_TYPE) {
      const routeId = route.route_id
      const line = route.route_short_name || route.route_long_name
      if (!routeId || !line) {
        throw new Error(`Rail route is missing route_id or name: ${JSON.stringify(route)}`)
      }
      lineByRouteId.set(routeId, line)
    }
  }
  if (lineByRouteId.size === 0) {
    throw new Error("GTFS feed contains no rail routes — wrong feed?")
  }

  const lineByTripId = new Map<string, string>()
  for (const trip of feed.trips) {
    const line = lineByRouteId.get(trip.route_id ?? "")
    if (line && trip.trip_id) lineByTripId.set(trip.trip_id, line)
  }

  const stopsById = new Map(feed.stops.map((stop) => [stop.stop_id ?? "", stop]))

  // Accumulate the lines calling at each platform, then fold platforms into
  // their parent station.
  const linesByStationId = new Map<string, Set<string>>()
  for (const stopTime of feed.stopTimes) {
    const line = lineByTripId.get(stopTime.trip_id ?? "")
    if (!line) continue

    const stopId = stopTime.stop_id ?? ""
    const stop = stopsById.get(stopId)
    if (!stop) {
      throw new Error(`stop_times references unknown stop_id ${stopId}`)
    }

    const stationId = stop.parent_station || stopId
    const existing = linesByStationId.get(stationId)
    if (existing) existing.add(line)
    else linesByStationId.set(stationId, new Set([line]))
  }

  const stations: StationRecord[] = []
  for (const [stationId, lines] of linesByStationId) {
    const stop = stopsById.get(stationId)
    if (!stop) {
      throw new Error(`parent_station ${stationId} has no matching stop record`)
    }
    const lat = Number(stop.stop_lat)
    const lng = Number(stop.stop_lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`Station ${stationId} has unusable coordinates`)
    }
    stations.push({
      stopId: stationId,
      name: stop.stop_name ?? "",
      lines: [...lines].sort(),
      location: { lng, lat },
    })
  }

  // Sorting makes the seed's output order deterministic, which is what lets a
  // re-run be compared to the previous one.
  return stations.sort((a, b) => a.stopId.localeCompare(b.stopId))
}

/**
 * Fails the seed if the derived station set does not match the pinned feed.
 *
 * The spec's instruction is to assert the expected result rather than trust the
 * join: a silently-wrong station table would let jobs be published against
 * stations that do not exist, and nothing downstream would notice.
 */
export function assertStationInvariants(stations: StationRecord[]): void {
  if (stations.length !== EXPECTED_STATION_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_STATION_COUNT} rail stations, derived ${stations.length}. ` +
        `If MARTA has changed the network, update EXPECTED_STATION_COUNT deliberately.`,
    )
  }

  const parkAndRides = stations.filter((station) => /PARK\s*&\s*RIDE/i.test(station.name))
  if (parkAndRides.length > 0) {
    throw new Error(
      `Park-and-ride lots are not rail stations: ${parkAndRides
        .map((station) => `${station.stopId} ${station.name}`)
        .join(", ")}`,
    )
  }

  const secDistrict = stations.find((station) => station.stopId === SEC_DISTRICT_STOP_ID)
  if (!secDistrict) {
    throw new Error(`Station ${SEC_DISTRICT_STOP_ID} is missing from the derived set`)
  }
  const expectedLines = [...SEC_DISTRICT_LINES].join(",")
  if (secDistrict.lines.join(",") !== expectedLines) {
    throw new Error(
      `Station ${SEC_DISTRICT_STOP_ID} should serve ${expectedLines}, derived ${secDistrict.lines.join(",")}`,
    )
  }

  const withoutLines = stations.filter((station) => station.lines.length === 0)
  if (withoutLines.length > 0) {
    throw new Error(
      `Stations with no line assignment: ${withoutLines.map((s) => s.stopId).join(", ")}`,
    )
  }
}
