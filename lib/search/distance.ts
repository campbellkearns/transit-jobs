/**
 * Distance units and the walk heuristic, in one place so the filter and the
 * display can never disagree about what a mile is.
 *
 * The split matters: `ST_DWithin` over a `geography` column is metres on the
 * spheroid, and that geodesic figure is the *exact* filter (spec art_9CmAgRnh,
 * deliverable 5). The ×1.25 factor below is a display estimate only — street
 * networks are longer than straight lines — and the spec flags it as the one
 * unsourced assumption in the research, which is why every rendered figure
 * carries the "≈" prefix and nothing is ever filtered by it.
 */

/** International mile. PostGIS geography distances come back in metres. */
export const METRES_PER_MILE = 1609.344

/**
 * Straight-line → walking multiplier. Sits in the common 1.2–1.3 urban range
 * but was never measured for Atlanta (spec art_9CmAgRnh, "Assumptions").
 */
export const WALK_DETOUR_FACTOR = 1.25

export function milesFromMetres(metres: number): number {
  return metres / METRES_PER_MILE
}

/** The "≈ walk" figure, in miles, rounded to the two decimals the UI shows. */
export function walkMilesFromMetres(metres: number): number {
  return Math.round(milesFromMetres(metres) * WALK_DETOUR_FACTOR * 100) / 100
}

/**
 * Renders the walk estimate. The "≈" is not decoration — the UI direction
 * (art_cJdHuq28) fixes it as the signal that this number is a heuristic, so
 * the prefix lives here rather than being retyped at each call site.
 */
export function formatWalkEstimate(walkMiles: number): string {
  return `≈ ${walkMiles.toFixed(2)} mi walk`
}
