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
 * A station marker: one colored dot per serving line, then the name.
 *
 * The name label is always rendered — color never carries meaning alone
 * (UI direction art_cJdHuq28) — and multi-line stations show one dot per
 * line, so Five Points reads as all four lines, not as whichever came first.
 */
export function stationMarkerHtml(station: {
  name: string
  lines: MartaLine[]
}): string {
  const dots = station.lines
    .map(
      (line) =>
        `<span class="map-station-dot" style="background:${LINE_MARKER_COLORS[line]}" aria-hidden="true"></span>`,
    )
    .join("")
  return `<span class="map-station-marker"><span class="map-station-dots">${dots}</span><span class="map-station-name">${escapeHtml(stationLabel(station.name))}</span></span>`
}

/**
 * A job-result pin: near-black, ringed in white so it reads on any tile.
 *
 * The active pin (the one the seeker is hovering in the list, or vice versa)
 * scales up and gains a soft ink halo — the highlight is ink, not a hue,
 * because chroma on the map means rail lines.
 */
export function jobPinHtml(active: boolean): string {
  return `<span class="map-job-pin${active ? " is-active" : ""}"></span>`
}
