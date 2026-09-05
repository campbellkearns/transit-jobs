import type { LngLat } from "@/db/postgis"

// Mean Earth radius in miles (IUGG value, 6371.0088 km). Used consistently
// with the spec's reference SQL, which works in miles throughout.
const EARTH_RADIUS_MILES = 3958.7613

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Great-circle (haversine) distance between two WGS84 points, in miles.
 *
 * This mirrors what PostGIS's `ST_Distance` over a `geography` column
 * computes (spheroid distance, converted from metres) closely enough for
 * display purposes — the exact search filter stays server-side `ST_DWithin`
 * (see spec deliverable 2); this function only ever feeds the UI's "≈"
 * estimate, never a filter.
 */
export function geodesicMiles(a: LngLat, b: LngLat): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng

  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * The UI's "≈ walk" figure: geodesic distance × the research's 1.25 detour
 * factor (Research findings §3 — a labeled heuristic, never the search
 * filter; see spec deliverable 7 and the UI direction's WalkEstimate
 * contract, which requires the ≈ prefix at every call site). Rounded to
 * hundredths, matching the spec's reference SQL
 * (`round((... * 1.25)::numeric, 2)`).
 */
export function walkEstimateMiles(a: LngLat, b: LngLat): number {
  const DETOUR_FACTOR = 1.25
  return Math.round(geodesicMiles(a, b) * DETOUR_FACTOR * 100) / 100
}
