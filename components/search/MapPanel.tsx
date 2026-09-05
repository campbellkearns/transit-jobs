"use client"

import "leaflet/dist/leaflet.css"

import { useEffect, useMemo } from "react"
import { divIcon, latLngBounds } from "leaflet"
import { MapContainer, Marker, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet"

import { jobPinHtml, stationMarkerHtml } from "@/lib/search/mapMarkers"
import type { SearchResult, SearchResultStation } from "@/lib/search/query"

/**
 * OSM raster tiles. The attribution contract is fixed by spec deliverable 6:
 * "© OpenStreetMap contributors" plus the ODbL notice, visible on the map
 * itself — Leaflet's attribution control renders this string, so the license
 * ships with every map, not with a footer someone can scroll past.
 */
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &middot; map data <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener noreferrer">ODbL</a>'

/** Dot box only — the name label overflows to the right, on purpose. */
const STATION_ICON_SIZE: [number, number] = [12, 12]
const STATION_ICON_ANCHOR: [number, number] = [6, 6]
const JOB_ICON_SIZE: [number, number] = [12, 12]
const JOB_ICON_ANCHOR: [number, number] = [6, 6]

/** Fallback center (downtown Atlanta) for the instant before fitting. */
const FALLBACK_CENTER: [number, number] = [33.749, -84.388]

/**
 * Viewport (px) at which the search results leave page flow and become the
 * floating rail overlaying the map's left edge. Must match the `md:`
 * breakpoint classes on the rail container in SearchWorkspace.
 */
const RAIL_OVERLAY_MIN_VIEWPORT = 768

/**
 * The rail overlays the map on desktop, so fitted bounds must center the
 * network in the space beside the rail — station markers and their name
 * labels must not land beneath it. A no-op below the overlay breakpoint
 * (where the rail is page flow, not an overlay) and in focused mode (which
 * has no rail).
 */
function railInset(viewportWidth: number, railWidth: number | undefined): number | undefined {
  if (railWidth === undefined || viewportWidth < RAIL_OVERLAY_MIN_VIEWPORT) return undefined
  return railWidth
}

type FitPositionsProps = {
  positions: [number, number][]
  maxZoom: number
  /** Horizontal room (px) kept clear on the left — the floating rail's width. */
  paddingLeft?: number
}

/**
 * Frames the given positions on first paint.
 *
 * The map's job is orientation — where the network sits and where this
 * search's results fall inside it — so the viewport is derived from the
 * points themselves rather than a hardcoded Atlanta bounding box that
 * silently rots as the seed or product geography changes. Search frames
 * the whole network (stations only); focused mode frames a job pin plus
 * its stations, so it is allowed to zoom in tighter.
 */
function FitPositions({ positions, maxZoom, paddingLeft }: FitPositionsProps) {
  const map = useMap()

  useEffect(() => {
    if (positions.length === 0) return
    const bounds = latLngBounds(positions)
    const fitOptions = paddingLeft
      ? {
          paddingTopLeft: [paddingLeft + 24, 24] as [number, number],
          paddingBottomRight: [24, 24] as [number, number],
          maxZoom,
        }
      : { padding: [24, 24] as [number, number], maxZoom }
    map.fitBounds(bounds, fitOptions)
  }, [map, positions, maxZoom, paddingLeft])

  return null
}

/**
 * Search framing keeps the whole network visible; focused framing (the job
 * detail page) is a single job and its walking-distance stations, so a
 * tighter zoom ceiling keeps the pin readable instead of shrinking it to
 * network scale.
 */
const SEARCH_FIT_MAX_ZOOM = 14
const FOCUSED_FIT_MAX_ZOOM = 15

/**
 * A single job in focused mode — the shape the job detail page hands over.
 * Deliberately its own type rather than `SearchResult`: a detail page is not
 * a search result, and the shell only needs pin identity + tooltip text.
 */
export type FocusedJob = {
  id: string
  title: string
  companyName: string
  location: { lat: number; lng: number }
}

type MapPanelProps = {
  /** Job pins for the search half. Unused in focused mode. */
  results?: SearchResult[]
  stations: SearchResultStation[]
  activeJobId?: string | null
  onActiveJobChange?: (jobId: string | null) => void
  /**
   * Focused single-job mode (job detail page): exactly one pin, always in
   * its active/highlighted state, with the viewport fitted on it — stations
   * for context. Hover sync is a search-list interaction; with no list
   * beside it, focused mode wires no handlers.
   */
  focusedJob?: FocusedJob
  /**
   * Wheel behavior is a surface decision: on the search canvas the map IS
   * the page (there is nothing behind it left to scroll), so a wheel over
   * the map zooms — the Zillow/Airbnb pattern the full-bleed rework calls
   * for. The detail map is a card inside a scrolling page, where a wheel
   * should scroll the page, so it keeps the default (off).
   */
  scrollWheelZoom?: boolean
  /**
   * Width (px) of the floating results rail overlaying the search map's
   * left edge — fitted bounds keep that space clear so station labels stay
   * visible beside the rail, not under it. Applied only at the rail's
   * overlay viewport.
   */
  fitPaddingLeft?: number
  /**
   * Full-bleed presentation (the search canvas): drops the card chrome —
   * the rounded border — because the map's edges are the page's edges. The
   * detail card keeps the chrome.
   */
  fullBleed?: boolean
}

/**
 * The map half of the search view (T7), behind `next/dynamic` `ssr: false`.
 *
 * Leaflet touches `window` at import time, so this component never renders on
 * the server — the SSR frame is SearchWorkspace's skeleton, which the client
 * swaps once the chunk lands. That split is also what keeps hydration clean:
 * the server's markup never contains map DOM for the client to mismatch.
 *
 * Two modes:
 *
 * - Search (default): the page's full-bleed canvas, edge to edge below the
 *   filter bar, with every rail station as a line-colored, always-labeled
 *   marker and each job result as an ink pin at its real location. The
 *   results float over it as a rail; hovering either the rail's rows or the
 *   pins highlights the matching pin/row via `activeJobId` — the same
 *   nearest-station geography the list is sorted by. The wheel zooms (the
 *   map is the page; see `scrollWheelZoom`), and the fit keeps the rail's
 *   width clear so labels stay readable (see `fitPaddingLeft`).
 * - Focused (`focusedJob`, job detail page): one always-active pin for the
 *   selected job beside its associated stations, viewport fitted on the pin,
 *   presented as a card with the wheel left alone.
 *
 * Height is the caller's job: the shell fills its container (`h-full`), and
 * the call site proposes the size — the viewport on search, a fixed-height
 * card on the detail page.
 */
export default function MapPanel({
  results = [],
  stations,
  activeJobId = null,
  onActiveJobChange,
  focusedJob,
  scrollWheelZoom = false,
  fitPaddingLeft,
  fullBleed = false,
}: MapPanelProps) {
  // Memoized so the fit effect sees stable deps — an inline array would
  // re-fit the viewport after every render.
  const fitPositions = useMemo<[number, number][]>(() => {
    const points: [number, number][] = stations.map(
      (station) => [station.location.lat, station.location.lng] as [number, number],
    )
    if (focusedJob) {
      points.unshift([focusedJob.location.lat, focusedJob.location.lng])
    }
    return points
  }, [focusedJob, stations])

  // The fit padding is a viewport decision (the rail only overlays at md+),
  // read once per render — this component is client-only (`next/dynamic`
  // `ssr: false`), so `window` is a given.
  const railPadding = railInset(typeof window === "undefined" ? 0 : window.innerWidth, fitPaddingLeft)

  return (
    <div
      className={
        fullBleed
          ? "h-full overflow-hidden"
          : "h-full overflow-hidden rounded-md border border-ink-primary/10"
      }
    >
      {/*
        scrollWheelZoom is per-surface (see the prop doc). The +/- control
        sits top-right — clear of the floating results rail on the left —
        keeping zoom reachable for touch and keyboard users regardless.
      */}
      <MapContainer
        className="h-full w-full"
        center={FALLBACK_CENTER}
        zoom={10}
        scrollWheelZoom={scrollWheelZoom}
        zoomControl={false}
      >
        <ZoomControl position="topright" />
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} maxZoom={19} />
        <FitPositions
          positions={fitPositions}
          maxZoom={focusedJob ? FOCUSED_FIT_MAX_ZOOM : SEARCH_FIT_MAX_ZOOM}
          paddingLeft={railPadding}
        />

        {stations.map((station) => (
          <Marker
            key={station.stopId}
            position={[station.location.lat, station.location.lng]}
            interactive={false}
            icon={divIcon({
              className: "map-station-icon",
              html: stationMarkerHtml(station),
              iconSize: STATION_ICON_SIZE,
              iconAnchor: STATION_ICON_ANCHOR,
            })}
          />
        ))}

        {focusedJob ? (
          <Marker
            key={focusedJob.id}
            position={[focusedJob.location.lat, focusedJob.location.lng]}
            zIndexOffset={1000}
            icon={divIcon({
              className: "map-job-icon",
              html: jobPinHtml(true),
              iconSize: JOB_ICON_SIZE,
              iconAnchor: JOB_ICON_ANCHOR,
            })}
          >
            <Tooltip direction="top" offset={[0, -8]} className="map-job-tooltip">
              <strong className="font-semibold text-ink-primary">{focusedJob.title}</strong>
              {" · "}
              {focusedJob.companyName}
            </Tooltip>
          </Marker>
        ) : (
          results.map((job) => {
          const isActive = job.id === activeJobId
          return (
            <Marker
              key={job.id}
              position={[job.location.lat, job.location.lng]}
              zIndexOffset={isActive ? 1000 : 0}
              icon={divIcon({
                className: "map-job-icon",
                html: jobPinHtml(isActive),
                iconSize: JOB_ICON_SIZE,
                iconAnchor: JOB_ICON_ANCHOR,
              })}
              eventHandlers={{
                mouseover: () => onActiveJobChange?.(job.id),
                mouseout: () => onActiveJobChange?.(null),
                click: () => onActiveJobChange?.(job.id),
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} className="map-job-tooltip">
                <strong className="font-semibold text-ink-primary">{job.title}</strong>
                {" · "}
                {job.companyName}
              </Tooltip>
            </Marker>
          )
        })
        )}
      </MapContainer>
    </div>
  )
}
