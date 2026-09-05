import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import path from "node:path"

import { unzipSync, zipSync } from "fflate"

import { parseCsv, RAIL_ROUTE_TYPE } from "../db/gtfs"

/**
 * Rebuilds gtfs/google_transit.zip from the upstream MARTA feed.
 *
 * The upstream archive is 18.6 MB, almost all of it route geometry and bus
 * schedules the seed never reads. Committing that would tax every clone and CI
 * checkout, so this keeps a ~1.3 MB subset — while deliberately preserving the
 * data the seed's join has to discriminate against. See gtfs/README.md.
 */

const UPSTREAM_URL = "https://itsmarta.com/google_transit_feed/google_transit.zip"
const OUTPUT_PATH = path.join("gtfs", "google_transit.zip")

/** Files copied through untouched, because the join filters on their contents. */
const VERBATIM_FILES = [
  "agency.txt",
  "calendar.txt",
  "calendar_dates.txt",
  "routes.txt",
  "stops.txt",
  "trips.txt",
] as const

/**
 * Non-rail trips whose stop_times are kept. Without them a seed that forgot to
 * filter stop_times by rail trip would still produce 38 stations and the tests
 * would pass on broken logic.
 */
const BUS_TRIP_SAMPLE_SIZE = 800

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function main() {
  console.log(`Downloading ${UPSTREAM_URL} ...`)
  const response = await fetch(UPSTREAM_URL)
  if (!response.ok) {
    throw new Error(`Upstream feed returned ${response.status} ${response.statusText}`)
  }
  const upstream = new Uint8Array(await response.arrayBuffer())
  console.log(`  ${upstream.length} bytes, sha256 ${sha256(upstream)}`)

  const archive = unzipSync(upstream)
  const decoder = new TextDecoder("utf-8")
  const fileOf = (name: string): Uint8Array => {
    const bytes = archive[name]
    if (!bytes) throw new Error(`Upstream feed is missing ${name}`)
    return bytes
  }

  const routes = parseCsv(decoder.decode(fileOf("routes.txt")))
  const railRouteIds = new Set(
    routes.filter((route) => route.route_type === RAIL_ROUTE_TYPE).map((route) => route.route_id),
  )
  // The streetcar is route_type=0 and must stay in the fixture as something the
  // rail filter is required to reject.
  const streetcarRouteIds = new Set(
    routes.filter((route) => route.route_type === "0").map((route) => route.route_id),
  )

  const trips = parseCsv(decoder.decode(fileOf("trips.txt")))
  const keptTripIds = new Set<string>()
  const busTripIds: string[] = []
  for (const trip of trips) {
    const tripId = trip.trip_id ?? ""
    const routeId = trip.route_id ?? ""
    if (railRouteIds.has(routeId) || streetcarRouteIds.has(routeId)) keptTripIds.add(tripId)
    else busTripIds.push(tripId)
  }
  busTripIds.sort()
  const stride = Math.max(1, Math.floor(busTripIds.length / BUS_TRIP_SAMPLE_SIZE))
  for (let i = 0, taken = 0; i < busTripIds.length && taken < BUS_TRIP_SAMPLE_SIZE; i += stride) {
    const tripId = busTripIds[i]
    if (tripId !== undefined) {
      keptTripIds.add(tripId)
      taken++
    }
  }

  // stop_times is ~108 MB, so it is filtered line-wise rather than parsed into
  // objects; every row is a plain unquoted CSV record.
  const stopTimesText = decoder.decode(fileOf("stop_times.txt"))
  const lines = stopTimesText.split("\n")
  const header = lines[0] ?? ""
  const tripIdColumn = header.replace(/\r$/, "").split(",").indexOf("trip_id")
  if (tripIdColumn === -1) throw new Error("stop_times.txt has no trip_id column")

  const keptRows = [header.replace(/\r$/, "")]
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const row = line.replace(/\r$/, "")
    if (keptTripIds.has(row.split(",")[tripIdColumn] ?? "")) keptRows.push(row)
  }
  console.log(`  stop_times: keeping ${keptRows.length - 1} of ${lines.length - 1} rows`)

  const encoder = new TextEncoder()
  const output: Record<string, Uint8Array> = {
    "stop_times.txt": encoder.encode(keptRows.join("\r\n") + "\r\n"),
  }
  for (const name of VERBATIM_FILES) output[name] = fileOf(name)

  const zipped = zipSync(output, { level: 9 })
  await writeFile(OUTPUT_PATH, zipped)
  console.log(`Wrote ${OUTPUT_PATH}: ${zipped.length} bytes, sha256 ${sha256(zipped)}`)
  console.log("Update the provenance table in gtfs/README.md, then re-run the seed tests.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
