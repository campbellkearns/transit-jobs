import { sql } from "drizzle-orm"

import type { LngLat } from "@/db/postgis"
import type { connect } from "./database"

type Db = ReturnType<typeof connect>["db"]

/**
 * A geodesically exact point at `metres`/`azimuthDegrees` from a station's
 * stored location, via PostGIS `ST_Project` on the real geography column.
 * Boundary tests (`ONE_MILE_METERS` vs. `ONE_MILE_METERS * 1.01`) then check
 * against the same primitive `findStationsBeyondOneMile` uses, instead of a
 * hand-computed approximation that could quietly drift from it.
 */
export async function pinAtDistanceFromStation(
  db: Db,
  stationStopId: string,
  metres: number,
  azimuthDegrees = 90,
): Promise<LngLat> {
  const rows = await db.execute<{ lng: number; lat: number }>(sql`
    select st_x(pt::geometry) as lng, st_y(pt::geometry) as lat
    from (
      select st_project(
        (select location from stations where stop_id = ${stationStopId}),
        ${metres}::double precision,
        radians(${azimuthDegrees}::double precision)
      ) as pt
    ) t
  `)

  const row = rows[0]
  if (!row) throw new Error(`could not project a pin from station "${stationStopId}"`)
  return { lng: Number(row.lng), lat: Number(row.lat) }
}
