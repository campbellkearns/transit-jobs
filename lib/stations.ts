import "server-only"
import { getDb } from "@/db"
import { stations } from "@/db/schema"

export type StationSummary = { stationId: string; name: string; lines: string[] }

/**
 * All 38 seeded MARTA rail stations, alphabetically. Feeds the employer
 * StationPicker (T4); a public, read-only list — station identities and
 * lines are not employer- or seeker-specific.
 */
export async function listStations(): Promise<StationSummary[]> {
  const db = getDb()
  const rows = await db.select().from(stations).orderBy(stations.name)
  return rows.map((row) => ({ stationId: row.stopId, name: row.name, lines: row.lines }))
}
