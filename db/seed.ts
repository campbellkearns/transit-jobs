import { readFile } from "node:fs/promises"
import path from "node:path"

import { count, notInArray, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import {
  assertStationInvariants,
  deriveRailStations,
  readGtfsFeed,
  type StationRecord,
} from "./gtfs"
import * as schema from "./schema"
import { stations } from "./schema"
import { seedEmployersAndJobs } from "./seed-content"

export const PINNED_GTFS_PATH = path.join("gtfs", "google_transit.zip")

export type Database = ReturnType<typeof drizzle<typeof schema>>

/**
 * The value the conflicting row would have been given, for use in the DO UPDATE
 * clause. `sql.raw` is required because this names a column of the special
 * `excluded` pseudo-table, not a bindable value.
 */
function excluded(column: PgColumn) {
  return sql.raw(`excluded."${column.name}"`)
}

export type StationSeedResult = {
  stationCount: number
  removedCount: number
}

export type SeedResult = StationSeedResult & {
  employerCount: number
  companyCount: number
  jobCount: number
  jobStationCount: number
}

/** Reads and validates the station set from the pinned feed on disk. */
export async function loadPinnedStations(zipPath = PINNED_GTFS_PATH): Promise<StationRecord[]> {
  const bytes = await readFile(path.resolve(zipPath))
  const derived = deriveRailStations(readGtfsFeed(bytes))
  assertStationInvariants(derived)
  return derived
}

/**
 * Writes the station set, and is safe to run any number of times.
 *
 * Idempotence is structural rather than incidental: `stop_id` is the primary
 * key and the feed is pinned, so the same 38 rows are derived every run and
 * conflicting inserts update in place. Nothing is deleted and recreated, which
 * matters because `job_stations` references these rows — a delete-then-insert
 * seed would either break those associations or be blocked by them.
 *
 * Stations that have dropped out of the feed are removed afterwards. If such a
 * row still has jobs attached, the `ON DELETE RESTRICT` foreign key raises
 * rather than letting a station vanish from under a live posting.
 */
export async function seedStations(
  db: Database,
  records: StationRecord[],
): Promise<StationSeedResult> {
  if (records.length === 0) {
    throw new Error("Refusing to seed an empty station set")
  }

  await db
    .insert(stations)
    .values(records)
    .onConflictDoUpdate({
      target: stations.stopId,
      set: {
        name: excluded(stations.name),
        lines: excluded(stations.lines),
        location: excluded(stations.location),
      },
    })

  const removed = await db
    .delete(stations)
    .where(
      notInArray(
        stations.stopId,
        records.map((record) => record.stopId),
      ),
    )
    .returning({ stopId: stations.stopId })

  const [row] = await db.select({ value: count() }).from(stations)

  return { stationCount: row?.value ?? 0, removedCount: removed.length }
}

/**
 * Connects, seeds, and closes. Used by `npm run db:seed`.
 *
 * Content seeding runs after stations, on the same connection: every job
 * association references a station row, so the order isn't optional.
 */
export async function runSeed(
  connectionString: string,
  zipPath = PINNED_GTFS_PATH,
): Promise<SeedResult> {
  const client = postgres(connectionString, { max: 1 })
  try {
    const db = drizzle(client, { schema })
    const stationResult = await seedStations(db, await loadPinnedStations(zipPath))
    const contentResult = await seedEmployersAndJobs(db)
    return { ...stationResult, ...contentResult }
  } finally {
    await client.end()
  }
}
