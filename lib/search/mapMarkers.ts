import type { MartaLine } from "@/db/schema"

/**
 * Pure HTML builders for the Leaflet markers (T7).
 *
 * Leaflet's `divIcon` renders a raw HTML string, outside React. Keeping the
 * string construction here — rather than inline in the map component — keeps
 * it unit-testable and makes the escaping explicit: station names come from
 * the GTFS seed and reach the DOM via innerHTML, so they are escaped like any
 * other untrusted text.
 *
 * The line hues mirror the Tailwind tokens in app/tokens.css (blue-600,
 * amber-400, green-600, red-600). They are duplicated as literals because
 * inline styles are the only way to color injected HTML; the two sources must
 * stay in step, and both name the same token values.
 */
export const LINE_MARKER_COLORS: Record<MartaLine, string> = {
  BLUE: "#2563eb",
  GOLD: "#fbbf24",
  GREEN: "#16a34a",
  RED: "#dc2626",
}

/** Mirrors --color-ink-primary in app/tokens.css (gray-900). */
const INK = "#111827"

/**
 * Glyph color inside a line badge. White reads on BLUE/GREEN/RED; GOLD is
 * light enough (amber-400) that white fails contrast, so it takes ink.
 */
const LINE_BADGE_TEXT_COLORS: Record<MartaLine, string> = {
  BLUE: "#ffffff",
  GOLD: INK,
  GREEN: "#ffffff",
  RED: "#ffffff",
}

/**
 * Badge geometry, shared with MapPanel's icon boxes/anchors so the CSS, the
 * emitted HTML, and Leaflet's anchor math cannot drift apart. Badges overlap
 * in a cascade at multi-line stations: each later badge starts STEP px right
 * of the previous one (the CSS margin pulls the full 16px tile back).
 */
export const STATION_BADGE_SIZE = 16
export const STATION_BADGE_STEP = 7

/**
 * Teardrop pin geometry (px). 12px head, short tail, drawn inside a 16×22 box
 * with 2px padding so the white ring (a 4px stroke, half of it outside the
 * path) fits without clipping. The anchored point is the ink tip.
 */
export const JOB_PIN_WIDTH = 16
export const JOB_PIN_HEIGHT = 22
/** The ink tip's position inside the pin box — Leaflet's anchor target. */
export const JOB_PIN_TIP: [number, number] = [8, 20]

/** The teardrop body: 12px head circle, tangent joins, tail to the tip. */
const JOB_PIN_PATH = "M8 20 C6.6 18 2 12 2 8 A6 6 0 1 1 14 8 C14 12 9.4 18 8 20 Z"

/** Icon box + anchor for a station's badge cascade, centered on the station. */
export function stationIconBox(lineCount: number): {
  size: [number, number]
  anchor: [number, number]
} {
  const width = STATION_BADGE_SIZE + (lineCount - 1) * STATION_BADGE_STEP
  return { size: [width, STATION_BADGE_SIZE], anchor: [width / 2, STATION_BADGE_SIZE / 2] }
}

/** Icon box + anchor for a job pin: the ink tip sits on the job location. */
export const JOB_PIN_BOX = {
  size: [JOB_PIN_WIDTH, JOB_PIN_HEIGHT] as [number, number],
  anchor: JOB_PIN_TIP,
}

/** Map labels read shorter without the GTFS naming convention. */
const STATION_SUFFIX = / STATION$/i

export function stationLabel(name: string): string {
  return name.replace(STATION_SUFFIX, "")
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

function escapeHtml(text: string): string {
  // The regex only emits keys of HTML_ESCAPES, but the index type can't know
  // that — falling back to the raw character is the honest shape of the truth.
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)
}

/**
 * A station marker: one rounded-square line badge per serving line, then the
 * name (shape-grammar split, art_HltyfOl7 decision A).
 *
 * The name label is always rendered — color never carries meaning alone
 * (UI direction art_cJdHuq28) — and the label rule from the locked decision
 * keeps it that way: no zoom gating, no density hiding, for serving or
 * non-serving stations alike. Multi-line stations cascade one badge per line
 * (later badges overlap the earlier ones' right edge), so Five Points reads
 * as all four lines, not as whichever came first.
 */
export function stationMarkerHtml(station: {
  name: string
  lines: MartaLine[]
}): string {
  const badges = station.lines
    .map(
      (line) =>
        `<span class="map-station-badge" style="background:${LINE_MARKER_COLORS[line]}" aria-hidden="true"><span class="map-station-badge-m" style="color:${LINE_BADGE_TEXT_COLORS[line]}">M</span></span>`,
    )
    .join("")
  return `<span class="map-station-marker"><span class="map-station-badges">${badges}</span><span class="map-station-name">${escapeHtml(stationLabel(station.name))}</span></span>`
}

/**
 * A job-result pin: an ink teardrop with a white ring, its point on the
 * location (shape-grammar split, art_HltyfOl7 decision A) — badges are
 * infrastructure, pins are destinations.
 *
 * The ink is inline (mirroring --color-ink-primary) because the fill rides
 * the injected HTML, and it must stay ink: chroma on the map means rail
 * lines, never jobs. The white ring is a 4px stroke painted under the fill
 * (2px visible), rounded so it follows the tip. The active pin (the one the
 * seeker is hovering in the list, or vice versa) scales up and gains a soft
 * ink halo — the highlight is ink, not a hue.
 */
export function jobPinHtml(active: boolean): string {
  return `<svg class="map-job-pin${active ? " is-active" : ""}" width="${JOB_PIN_WIDTH}" height="${JOB_PIN_HEIGHT}" viewBox="0 0 ${JOB_PIN_WIDTH} ${JOB_PIN_HEIGHT}" aria-hidden="true" focusable="false"><path d="${JOB_PIN_PATH}" fill="${INK}" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" paint-order="stroke" /></svg>`
}
