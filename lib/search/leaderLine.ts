import type { SearchResult } from "./query"

/**
 * Geometry and styling for the active job's leader line (art_HltyfOl7, locked
 * decision "Leader lines — active-only"): a thin ink line from the active/
 * hovered job's pin to the station its rail row groups under.
 *
 * The line is drawn ONLY for the active job — never always-on. With no active
 * job there is nothing to render, which is the deactivation cleanup the
 * overlay performs by rendering nothing.
 *
 * Everything lives here, beside the marker builders, so the feature is
 * unit-testable and isolated from the A (markers) and B (rail)
 * implementations: dropping or restyling the leader line touches this module
 * and its overlay component, nothing else.
 */

/** Mirrors --color-ink-primary in app/tokens.css (gray-900) — the same literal the marker builders inline. */
const INK = "#111827"

/**
 * The line's two states. "Idle" is the resting indication: the job became
 * active through the rail's hover/focus sync and the pointer is elsewhere.
 * "Active" is direct engagement: the pointer is on the pin itself. Idle draws
 * dashed and lighter; active solidifies — that dashed-to-solid beat is what
 * makes the connection legible at a glance in the live preview this feature
 * ships to evaluate.
 */
export type LeaderLineState = "idle" | "active"

export type LeaderLineOptions = {
  color: string
  weight: number
  opacity: number
  /**
   * Leaflet dashArray; absent = solid. The overlay remounts the polyline per
   * state (a `key` on the Polyline) rather than updating pathOptions in
   * place: react-leaflet applies updates through Leaflet's setStyle, which
   * MERGES options — an absent key could never clear a drawn dash.
   */
  dashArray?: string
}

/**
 * Ink only, never a line hue: chroma on the map means rail lines
 * (mapMarkers' LINE_MARKER_COLORS), so the leader line may not borrow it.
 */
export function leaderLineOptions(state: LeaderLineState): LeaderLineOptions {
  // 2px / 0.85: the 1.5px / 0.55 idle line shipped for evaluation (PR #15)
  // measured faint against OSM street detail at cluster zoom — the weight and
  // opacity step up (Brandon, 2026-09-09) so the dash still reads at rest
  // while remaining a hair under the active state's 0.9.
  return state === "active"
    ? { color: INK, weight: 2, opacity: 0.9 }
    : { color: INK, weight: 2, opacity: 0.85, dashArray: "3 6" }
}

/**
 * The active result, or nothing. Null/undefined activeJobId — the resting
 * state of the shared sync — selects nothing, so the overlay draws no line.
 */
export function activeLeaderJob(
  results: SearchResult[],
  activeJobId: string | null | undefined,
): SearchResult | undefined {
  return activeJobId ? results.find((job) => job.id === activeJobId) : undefined
}

/**
 * The line's endpoints: the job pin's anchored tip (the tip sits on the job
 * location) and the job's serving station. `SearchResult.station` is the
 * query's nearest station — the same one `groupResultsByStation` partitions
 * the rail by — so the line always lands on the station the row groups
 * under.
 *
 * Null when there is nothing to draw: no active job (the deactivation
 * cleanup) or a result missing its geography.
 */
export function leaderLinePositions(
  job: Pick<SearchResult, "location" | "station"> | null | undefined,
): [number, number][] | null {
  if (!job) return null
  const { location, station } = job
  if (!location || !station?.location) return null
  return [
    [location.lat, location.lng],
    [station.location.lat, station.location.lng],
  ]
}
