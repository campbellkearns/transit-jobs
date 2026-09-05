"use client"

import "leaflet/dist/leaflet.css"

import { useEffect } from "react"
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

type FitStationsProps = {
  stations: SearchResultStation[]
}

/**
 * Frames all stations on first paint.
 *
 * The map's job is orientation — where the network sits and where this
 * search's results fall inside it — so the viewport is derived from the
 * stations themselves rather than a hardcoded Atlanta bounding box that
 * silently rots as the seed or product geography changes.
 */
function FitStations({ stations }: FitStationsProps) {
  const map = useMap()

  useEffect(() => {
    if (stations.length === 0) return
    const bounds = latLngBounds(
      stations.map((station) => [station.location.lat, station.location.lng] as [number, number]),
    )
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 })
  }, [map, stations])

  return null
}

type MapPanelProps = {
  results: SearchResult[]
  stations: SearchResultStation[]
  activeJobId: string | null
  onActiveJobChange: (jobId: string | null) => void
}

/**
 * The map half of the search view (T7), behind `next/dynamic` `ssr: false`.
 *
 * Leaflet touches `window` at import time, so this component never renders on
 * the server — the SSR frame is SearchWorkspace's skeleton, which the client
 * swaps once the chunk lands. That split is also what keeps hydration clean:
 * the server's markup never contains map DOM for the client to mismatch.
 *
 * Two marker layers, matching the search semantics (see lib/search/query):
 * every rail station as a line-colored, always-labeled marker, and each job
 * result as an ink pin at its real location. Hovering either side of the
 * list/map pair highlights the matching pin/row via `activeJobId` — the same
 * nearest-station geography the list is sorted by.
 */
export default function MapPanel({
  results,
  stations,
  activeJobId,
  onActiveJobChange,
}: MapPanelProps) {
  return (
    <div className="h-80 overflow-hidden rounded-md border border-ink-primary/10 md:h-[560px]">
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
        <FitStations stations={stations} />

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

        {results.map((job) => {
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
                mouseover: () => onActiveJobChange(job.id),
                mouseout: () => onActiveJobChange(null),
                click: () => onActiveJobChange(job.id),
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} className="map-job-tooltip">
                <strong className="font-semibold text-ink-primary">{job.title}</strong>
                {" · "}
                {job.companyName}
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
