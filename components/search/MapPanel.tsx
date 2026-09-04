"use client"

import "leaflet/dist/leaflet.css"

import { useEffect, useMemo } from "react"
import { divIcon, latLngBounds } from "leaflet"
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet"

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

type FitPositionsProps = {
  positions: [number, number][]
  maxZoom: number
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
function FitPositions({ positions, maxZoom }: FitPositionsProps) {
  const map = useMap()

  useEffect(() => {
    if (positions.length === 0) return
    const bounds = latLngBounds(positions)
    map.fitBounds(bounds, { padding: [24, 24], maxZoom })
  }, [map, positions, maxZoom])

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
 * - Search (default): every rail station as a line-colored, always-labeled
 *   marker, and each job result as an ink pin at its real location. Hovering
 *   either side of the list/map pair highlights the matching pin/row via
 *   `activeJobId` — the same nearest-station geography the list is sorted by.
 * - Focused (`focusedJob`, job detail page): one always-active pin for the
 *   selected job beside its associated stations, viewport fitted on the pin.
 *
 * Height is the caller's job: the shell fills its container (`h-full`), and
 * the call site proposes the size — viewport-height and sticky on search,
 * a fixed-height card on the detail page.
 */
export default function MapPanel({
  results = [],
  stations,
  activeJobId = null,
  onActiveJobChange,
  focusedJob,
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

  return (
    <div className="h-full overflow-hidden rounded-md border border-ink-primary/10">
      {/*
        scrollWheelZoom stays off: the map sits beside a scrolling list, and a
        wheel over the map should scroll the page, not silently zoom the map.
      */}
      <MapContainer
        className="h-full w-full"
        center={FALLBACK_CENTER}
        zoom={10}
        scrollWheelZoom={false}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} maxZoom={19} />
        <FitPositions
          positions={fitPositions}
          maxZoom={focusedJob ? FOCUSED_FIT_MAX_ZOOM : SEARCH_FIT_MAX_ZOOM}
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
