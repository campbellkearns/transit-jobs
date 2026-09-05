import { describe, expect, it } from "vitest"

import {
  LINE_MARKER_COLORS,
  jobPinHtml,
  stationLabel,
  stationMarkerHtml,
} from "@/lib/search/mapMarkers"

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

  it("renders one line-colored dot per serving line", () => {
    const html = stationMarkerHtml({
      name: "FIVE POINTS STATION",
      lines: ["BLUE", "GOLD", "GREEN", "RED"],
    })

    // A multi-line station reads as all of its lines, not the first one.
    for (const line of ["BLUE", "GOLD", "GREEN", "RED"] as const) {
      expect(html).toContain(`background:${LINE_MARKER_COLORS[line]}`)
    }
  })

  it("escapes HTML metacharacters in the station name", () => {
    const html = stationMarkerHtml({ name: '<script>alert("x")</script>', lines: ["BLUE"] })

    // Station names come from the seed and reach the DOM via innerHTML;
    // they must never inject markup.
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})

describe("jobPinHtml", () => {
  it("is a plain ink pin by default", () => {
    expect(jobPinHtml(false)).toBe('<span class="map-job-pin"></span>')
  })

  it("marks the active pin for the ink highlight", () => {
    expect(jobPinHtml(true)).toBe('<span class="map-job-pin is-active"></span>')
  })
})
