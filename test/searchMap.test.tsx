import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MapPanel, { type FocusedJob } from "@/components/search/MapPanel"
import { SearchWorkspace } from "@/components/search/SearchWorkspace"
import type { SearchResult, SearchResultStation } from "@/lib/search/query"

/**
 * react-leaflet needs a real browser layout (it instantiates L.Map on mount),
 * which jsdom does not have. The mock stands in for the rendering layer while
 * leaving everything this feature actually owns under test: the dynamic
 * import handshake, the marker HTML built by lib/search/mapMarkers, the
 * attribution string, and the list↔map sync.
 *
 * Leaflet's divIcon hands the HTML through `icon.options.html`, so the stub
 * markers surface it as a data attribute — what a marker displays is exactly
 * what the pure builders produced.
 */
type MarkerProps = {
  icon?: { options?: { html?: string } }
  position: [number, number]
  eventHandlers?: Record<string, (event?: unknown) => void>
  children?: ReactNode
}

/**
 * Shared fitBounds spy: FitPositions calls it on mount, and the focused-mode
 * tests assert the frame (points + zoom ceiling) the shell asks for.
 */
const { fitBoundsSpy } = vi.hoisted(() => ({ fitBoundsSpy: vi.fn() }))

vi.mock("react-leaflet", () => {
  function MapContainer({ children }: { children?: ReactNode }) {
    return <div data-testid="map-container">{children}</div>
  }

  function TileLayer({ attribution }: { attribution: string }) {
    return <div data-testid="map-tiles" data-attribution={attribution} />
  }

  function Marker({ icon, position, eventHandlers, children }: MarkerProps) {
    return (
      <div
        data-testid="map-marker"
        data-icon-html={icon?.options?.html ?? ""}
        data-position={position.join(",")}
        onMouseEnter={eventHandlers?.mouseover}
        onMouseLeave={eventHandlers?.mouseout}
      >
        {children}
      </div>
    )
  }

  function Tooltip({ children }: { children?: ReactNode }) {
    return <div data-testid="map-tooltip">{children}</div>
  }

  function useMap() {
    return { fitBounds: fitBoundsSpy }
  }

  return { MapContainer, TileLayer, Marker, Tooltip, useMap }
})

function makeStation(overrides: Partial<SearchResultStation> = {}): SearchResultStation {
  return {
    stopId: "FIVE-POINTS",
    name: "FIVE POINTS STATION",
    lines: ["BLUE", "GOLD", "GREEN", "RED"],
    location: { lng: -84.39, lat: 33.755 },
    ...overrides,
  }
}

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Warehouse Lead",
    companyName: "Northstar Logistics",
    category: "Logistics & Warehouse",
    experienceLevel: "Entry level",
    salaryMin: 38_000,
    salaryMax: 45_000,
    addressText: "123 Peachtree St NE",
    location: { lng: -84.4, lat: 33.75 },
    station: makeStation(),
    miles: 0.6,
    walkMiles: 0.75,
    ...overrides,
  }
}

const STATIONS: SearchResultStation[] = [
  makeStation(),
  makeStation({
    stopId: "DECATUR",
    name: "DECATUR STATION",
    lines: ["BLUE"],
    location: { lng: -84.29, lat: 33.77 },
  }),
]

const FIRST_RESULT = makeResult()

const RESULTS: SearchResult[] = [
  FIRST_RESULT,
  makeResult({
    id: "22222222-2222-2222-2222-222222222222",
    title: "Senior Analyst",
    companyName: "Acme Transit Co",
    station: STATIONS[1],
  }),
]

type WorkspaceProps = ComponentProps<typeof SearchWorkspace>

function renderWorkspace(overrides: Partial<WorkspaceProps> = {}) {
  return render(
    <SearchWorkspace results={RESULTS} stations={STATIONS} radiusMiles={1} {...overrides} />,
  )
}

describe("SearchWorkspace", () => {
  it("shows the skeleton first, then the map after the dynamic import lands", async () => {
    renderWorkspace()

    // ssr: false means the skeleton is what the server and the first client
    // render agree on — the map DOM exists only once the chunk resolves.
    // (Matched by text: the results count line is also a live region.)
    expect(screen.getByText(/loading map/i)).toBeInTheDocument()

    const map = await screen.findByTestId("map-container")
    expect(map).toBeInTheDocument()
    expect(screen.queryByText(/loading map/i)).not.toBeInTheDocument()
  })

  it("renders a labeled marker for every station", async () => {
    renderWorkspace()
    await screen.findByTestId("map-container")

    // Station markers and job pins share the stub; tell them apart by the
    // markup each pure builder produced.
    const stationHtmls = screen
      .getAllByTestId("map-marker")
      .map((marker) => marker.getAttribute("data-icon-html") ?? "")
      .filter((html) => html.includes("map-station-marker"))
    expect(stationHtmls).toHaveLength(STATIONS.length)

    expect(stationHtmls[0]).toContain("FIVE POINTS")
    expect(stationHtmls[0]).toContain("map-station-name")
    expect(stationHtmls[1]).toContain("DECATUR")
  })

  it("renders a pin for each job result, with its tooltip", async () => {
    renderWorkspace()
    await screen.findByTestId("map-container")

    const htmls = screen
      .getAllByTestId("map-marker")
      .map((marker) => marker.getAttribute("data-icon-html") ?? "")

    // Station markers come first; the job pins follow.
    expect(htmls.slice(STATIONS.length)).toHaveLength(RESULTS.length)
    expect(htmls.join("")).toContain("map-job-pin")

    const tooltips = screen.getAllByTestId("map-tooltip")
    expect(tooltips[0]).toHaveTextContent("Warehouse Lead")
    expect(tooltips[0]).toHaveTextContent("Northstar Logistics")
  })

  it("puts the OSM attribution, with ODbL, on the tile layer", async () => {
    renderWorkspace()
    await screen.findByTestId("map-container")

    const attribution = screen.getByTestId("map-tiles").getAttribute("data-attribution") ?? ""
    expect(attribution).toContain("OpenStreetMap</a> contributors")
    expect(attribution).toContain("ODbL")
  })

  it("highlights the matching pin when a list row is hovered, and clears on leave", async () => {
    renderWorkspace()
    await screen.findByTestId("map-container")

    const row = screen.getByRole("link", { name: /warehouse lead/i })
    fireEvent.mouseEnter(row)

    const activePins = screen
      .getAllByTestId("map-marker")
      .filter((marker) => (marker.getAttribute("data-icon-html") ?? "").includes("is-active"))
    expect(activePins).toHaveLength(1)
    // The row itself is marked active, for the highlighted row style.
    expect(row).toHaveAttribute("data-active")

    fireEvent.mouseLeave(row)
    expect(
      screen
        .getAllByTestId("map-marker")
        .filter((marker) => (marker.getAttribute("data-icon-html") ?? "").includes("is-active")),
    ).toHaveLength(0)
    expect(row).not.toHaveAttribute("data-active")
  })
})

describe("MapPanel search mode", () => {
  beforeEach(() => fitBoundsSpy.mockClear())

  it("renders a single search result as one inactive pin (single-result search)", async () => {
    render(
      <MapPanel results={[FIRST_RESULT]} stations={STATIONS} activeJobId={null} onActiveJobChange={vi.fn()} />,
    )
    await screen.findByTestId("map-container")

    const pins = screen
      .getAllByTestId("map-marker")
      .filter((marker) => (marker.getAttribute("data-icon-html") ?? "").includes("map-job-pin"))
    expect(pins).toHaveLength(1)
    expect(pins[0]?.getAttribute("data-icon-html")).not.toContain("is-active")
  })

  it("keeps the network framing — stations only, maxZoom 14", async () => {
    render(
      <MapPanel results={RESULTS} stations={STATIONS} activeJobId={null} onActiveJobChange={vi.fn()} />,
    )
    await screen.findByTestId("map-container")

    expect(fitBoundsSpy).toHaveBeenCalledTimes(1)
    const [, options] = fitBoundsSpy.mock.calls[0] ?? []
    expect(options).toEqual({ padding: [24, 24], maxZoom: 14 })
  })
})

describe("MapPanel focused mode (job detail page)", () => {
  beforeEach(() => fitBoundsSpy.mockClear())

  const FOCUSED_JOB: FocusedJob = {
    id: FIRST_RESULT.id,
    title: FIRST_RESULT.title,
    companyName: FIRST_RESULT.companyName,
    location: FIRST_RESULT.location,
  }

  function renderFocused() {
    return render(<MapPanel stations={STATIONS} focusedJob={FOCUSED_JOB} />)
  }

  it("renders the focused job's pin always active beside its stations, with its tooltip", async () => {
    renderFocused()
    await screen.findByTestId("map-container")

    const markers = screen.getAllByTestId("map-marker")
    const jobPins = markers.filter((marker) =>
      (marker.getAttribute("data-icon-html") ?? "").includes("map-job-pin"),
    )
    const stationMarkers = markers.filter((marker) =>
      (marker.getAttribute("data-icon-html") ?? "").includes("map-station-marker"),
    )

    expect(jobPins).toHaveLength(1)
    expect(jobPins[0]?.getAttribute("data-icon-html")).toContain("is-active")
    expect(stationMarkers).toHaveLength(STATIONS.length)
    expect(screen.getByTestId("map-tooltip")).toHaveTextContent("Warehouse Lead")
  })

  it("does not wire hover sync — hovering the pin leaves it active", async () => {
    renderFocused()
    await screen.findByTestId("map-container")

    const pin = screen
      .getAllByTestId("map-marker")
      .find((marker) => (marker.getAttribute("data-icon-html") ?? "").includes("map-job-pin"))
    if (!pin) throw new Error("focused job pin not rendered")

    fireEvent.mouseEnter(pin)
    fireEvent.mouseLeave(pin)

    expect(pin.getAttribute("data-icon-html")).toContain("is-active")
  })

  it("fits the viewport on the job pin plus its stations, tighter than the network framing", async () => {
    renderFocused()
    await screen.findByTestId("map-container")

    expect(fitBoundsSpy).toHaveBeenCalledTimes(1)
    const [bounds, options] = fitBoundsSpy.mock.calls[0] ?? []
    expect(options).toEqual({ padding: [24, 24], maxZoom: 15 })
    // Real Leaflet bounds: the frame contains the pin and every station.
    expect(bounds.contains([33.75, -84.4])).toBe(true)
    expect(bounds.contains([33.755, -84.39])).toBe(true)
    expect(bounds.contains([33.77, -84.29])).toBe(true)
  })
})
