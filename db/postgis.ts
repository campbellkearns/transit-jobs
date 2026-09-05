import { sql, type SQLWrapper } from "drizzle-orm"
import { customType } from "drizzle-orm/pg-core"

/**
 * A WGS84 coordinate. Longitude first mirrors PostGIS/GeoJSON axis order —
 * the opposite of the "lat, lng" order humans speak in, and a routine source
 * of silently-transposed points, so the field names are always explicit.
 */
export type LngLat = {
  lng: number
  lat: number
}

export const WGS84_SRID = 4326

/**
 * Extended WKT for a point. PostGIS accepts this as text input to a
 * `geography` column, which lets us bind coordinates as an ordinary
 * parameter instead of wrapping every insert in `ST_MakePoint(...)`.
 */
export function toPointEwkt({ lng, lat }: LngLat): string {
  return `SRID=${WGS84_SRID};POINT(${lng} ${lat})`
}

/**
 * Restores what a `geography(Point,4326)` typmod would have enforced: the
 * column holds points, in WGS84. PostGIS already rejects a non-lon/lat SRID on
 * its own, so the SRID half is belt-and-braces; the geometry-type half is not.
 */
export function pointConstraint(column: SQLWrapper) {
  // `sql.raw` on the SRID is deliberate: an interpolated value becomes a bind
  // parameter, and a CHECK expression cannot contain one.
  return sql`st_geometrytype(${column}::geometry) = 'ST_Point' and st_srid(${column}) = ${sql.raw(
    String(WGS84_SRID),
  )}`
}

const EWKB_POINT_TYPE = 1
const EWKB_SRID_FLAG = 0x20000000

/**
 * Parses the hex-encoded EWKB that Postgres returns for a `geography` column
 * back into a coordinate.
 *
 * Layout: 1 byte endianness, uint32 type (high bits carry flags), an optional
 * uint32 SRID when the SRID flag is set, then two float64s (X=lng, Y=lat).
 * Exported separately from the column type so the byte-level parsing is
 * directly testable without a database.
 */
export function parsePointEwkbHex(hex: string): LngLat {
  const bytes = Buffer.from(hex, "hex")
  if (bytes.length < 21) {
    throw new Error(`EWKB point too short: ${bytes.length} bytes`)
  }

  const littleEndian = bytes.readUInt8(0) === 1
  const readU32 = (offset: number) =>
    littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset)
  const readF64 = (offset: number) =>
    littleEndian ? bytes.readDoubleLE(offset) : bytes.readDoubleBE(offset)

  const typeWord = readU32(1)
  if ((typeWord & 0xff) !== EWKB_POINT_TYPE) {
    throw new Error(`Expected an EWKB point, got geometry type ${typeWord & 0xff}`)
  }

  const coordsOffset = (typeWord & EWKB_SRID_FLAG) === EWKB_SRID_FLAG ? 9 : 5
  return { lng: readF64(coordsOffset), lat: readF64(coordsOffset + 8) }
}

/**
 * A PostGIS `geography` column holding WGS84 points.
 *
 * Geography (not geometry) is what deliverable 2 needs: `ST_Distance` and
 * `ST_DWithin` return and accept metres on the spheroid, so the seeker's exact
 * one-mile filter is a plain metre comparison with no projection to choose.
 *
 * The type is declared unparameterised rather than as `geography(Point,4326)`
 * because drizzle-kit 0.31's SQL generator only leaves a type unquoted when it
 * starts with one of its known native types — a list that has `geometry` but
 * not `geography` — so the parameterised form is emitted as the quoted
 * identifier `"geography(Point,4326)"` and no such type exists. The two
 * guarantees the typmod would have given us are kept instead as an explicit
 * check constraint (see `pointConstraint`), which PostGIS enforces just as
 * strictly and which drizzle-kit can push unaided.
 */
export const geographyPoint = customType<{
  data: LngLat
  driverData: string
}>({
  dataType() {
    return "geography"
  },
  toDriver(value: LngLat): string {
    return toPointEwkt(value)
  },
  fromDriver(value: string): LngLat {
    return parsePointEwkbHex(value)
  },
})
