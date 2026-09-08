import { describe, expect, it } from "vitest"

import type { MartaLine } from "@/db/schema"
import {
  JOB_PIN_BOX,
  JOB_PIN_HEIGHT,
  JOB_PIN_TIP,
  JOB_PIN_WIDTH,
  LINE_MARKER_COLORS,
  STATION_BADGE_SIZE,
  STATION_BADGE_STEP,
  jobPinHtml,
  stationIconBox,
  stationLabel,
  stationMarkerHtml,
} from "@/lib/search/mapMarkers"

const ALL_LINES = ["BLUE", "GOLD", "GREEN", "RED"] as const

describe("stationLabel", () => {
  it("drops the GTFS ' STATION' suffix for map display", () => {
    expect(stationLabel("FIVE POINTS STATION")).toBe("FIVE POINTS")
    expect(stationLabel("DECATUR STATION")).toBe("DECATUR")
  })

  it("leaves names without the suffix alone", () => {
    expect(stationLabel("Airport")).toBe("Airport")
  })
})

describe("stationMarkerHtml", () => {
  it("always carries the station name label", () => {
    const html = stationMarkerHtml({ name: "FIVE POINTS STATION", lines: ["BLUE", "RED"] })

    expect(html).toContain("map-station-name")
    expect(html).toContain("FIVE POINTS")
    // The GTFS naming convention never reaches the map label.
    expect(html).not.toContain("STATION")
  })

  it("keeps the label visible for every line count — the labels rule has no zoom or density gating", () => {
    // The locked decision (art_HltyfOl7): serving-station labels are always
    // visible; non-serving stations keep the always-labeled default. The
    // builder has no zoom parameter and never omits the name.
    const lineSets: MartaLine[][] = [[], ["GOLD"], ["BLUE", "RED"], [...ALL_LINES]]
    for (const lines of lineSets) {
      const html = stationMarkerHtml({ name: "FIVE POINTS STATION", lines })

      expect(html).toContain("map-station-name")
      expect(html).toContain("FIVE POINTS")
      expect(html).not.toContain("is-hidden")
      expect(html).not.toMatch(/zoom/i)
    }
  })

  it("renders one line-colored rounded-square badge per serving line", () => {
    const html = stationMarkerHtml({
      name: "FIVE POINTS STATION",
      lines: [...ALL_LINES],
    })

    // A multi-line station reads as all of its lines, not the first one.
    expect(html.match(/map-station-badge"/g)).toHaveLength(ALL_LINES.length)
    for (const line of ALL_LINES) {
      expect(html).toContain(`background:${LINE_MARKER_COLORS[line]}`)
    }
    // Square grammar, not the old dot stack.
    expect(html).not.toContain("map-station-dot")
  })

  it("marks every badge with the M roundel, glyph-colored for its line's contrast", () => {
    const html = stationMarkerHtml({ name: "FIVE POINTS STATION", lines: ["GOLD", "RED"] })

    expect(html.match(/>M</g)).toHaveLength(2)
    // GOLD is light enough that a white glyph fails contrast — it takes ink.
    expect(html).toContain(`color:#111827`)
    expect(html).toContain("color:#ffffff")
  })

  it("escapes HTML metacharacters in the station name", () => {
    const html = stationMarkerHtml({ name: '<script>alert("x")</script>', lines: ["BLUE"] })

    // Station names come from the seed and reach the DOM via innerHTML;
    // they must never inject markup.
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})

describe("stationIconBox", () => {
  it("sizes a single-line station as one badge, centered on the station", () => {
    expect(stationIconBox(1)).toEqual({
      size: [STATION_BADGE_SIZE, STATION_BADGE_SIZE],
      anchor: [STATION_BADGE_SIZE / 2, STATION_BADGE_SIZE / 2],
    })
  })

  it("grows one cascade step per extra line and keeps the cascade centered", () => {
    const two = stationIconBox(2)
    expect(two.size).toEqual([STATION_BADGE_SIZE + STATION_BADGE_STEP, STATION_BADGE_SIZE])
    expect(two.anchor).toEqual([two.size[0] / 2, STATION_BADGE_SIZE / 2])

    // Five Points: four lines.
    const four = stationIconBox(4)
    expect(four.size).toEqual([
      STATION_BADGE_SIZE + 3 * STATION_BADGE_STEP,
      STATION_BADGE_SIZE,
    ])
    expect(four.anchor).toEqual([four.size[0] / 2, STATION_BADGE_SIZE / 2])
  })
})

describe("jobPinHtml", () => {
  it("is an ink teardrop SVG by default, sized to its box", () => {
    const html = jobPinHtml(false)

    expect(html).toContain('class="map-job-pin"')
    expect(html).toContain(`width="${JOB_PIN_WIDTH}"`)
    expect(html).toContain(`height="${JOB_PIN_HEIGHT}"`)
    // The head is a circle arc; the tail closes to the anchored tip.
    expect(html).toContain('d="M8 20')
    expect(html).toMatch(/A6 6 0 1 1/)
  })

  it("carries the white ring outside the ink fill", () => {
    const html = jobPinHtml(false)

    expect(html).toContain('stroke="#ffffff"')
    expect(html).toContain('paint-order="stroke"')
  })

  it("stays ink — no line hue ever colors a job pin", () => {
    const html = jobPinHtml(false)

    for (const hex of Object.values(LINE_MARKER_COLORS)) {
      expect(html).not.toContain(hex)
    }
    expect(html).toContain('fill="#111827"')
  })

  it("marks the active pin for the ink highlight", () => {
    expect(jobPinHtml(true)).toContain('class="map-job-pin is-active"')
    expect(jobPinHtml(false)).not.toContain("is-active")
  })
})

describe("job pin geometry", () => {
  it("anchors the teardrop's ink tip on the job location", () => {
    // The point must sit on the location — not the box center, which would
    // float the head over the site and bury the tip 2px deep.
    expect(JOB_PIN_TIP).toEqual([8, 20])
    expect(JOB_PIN_BOX.anchor).toEqual(JOB_PIN_TIP)
    expect(JOB_PIN_BOX.size).toEqual([JOB_PIN_WIDTH, JOB_PIN_HEIGHT])
  })

  it("leaves ring padding inside the box so the stroke never clips", () => {
    // The 4px ring stroke extends 2px past the path, which spans x 2–14 and
    // y 2–20 in a 16×22 box — tip centered, 2px above the box floor.
    expect(JOB_PIN_TIP[0]).toBe(JOB_PIN_WIDTH / 2)
    expect(JOB_PIN_HEIGHT - JOB_PIN_TIP[1]).toBe(2)
  })
})
