"use client"

import dynamic from "next/dynamic"
import { useState } from "react"

import type { SearchResult, SearchResultStation } from "@/lib/search/query"

import { ResultsList } from "./ResultsList"

function MapPanelSkeleton() {
  return (
    <div
      role="status"
      className="flex h-80 items-center justify-center rounded-md border border-ink-primary/10 bg-white text-sm text-ink-primary/60 md:h-full md:rounded-none md:border-0"
    >
      Loading map&hellip;
    </div>
  )
}

/**
 * The map is client-only: Leaflet reaches for `window` at import time, so the
 * chunk loads after hydration and the skeleton is what both the server and
 * the first client render agree on.
 */
const MapPanel = dynamic(() => import("./MapPanel"), {
  ssr: false,
  loading: () => <MapPanelSkeleton />,
})

type SearchWorkspaceProps = {
  results: SearchResult[]
  stations: SearchResultStation[]
  radiusMiles: number
}
/**
 * The floating rail's horizontal footprint: the rail is `w-[21rem]` (336px)
 * plus a `pl-4` (16px) gutter. The map's fitted bounds keep this much of its
 * left edge clear, so station markers and labels land beside the rail rather
 * than beneath it.
 */
const RAIL_OVERLAY_PX = 352

/**
 * The search workspace: a full-bleed map canvas with the results floating
 * over it as a scrollable rail (Brandon's 2026-09-04 rework of the split
 * view). On desktop the map is the page — edge to edge below the filter bar,
 * viewport-height, nothing scrolling behind it — and the rail overlays its
 * left side, scrolling within itself (`overscroll-contain`). A wheel over
 * the map zooms (MapPanel `scrollWheelZoom`); a wheel over the rail scrolls
 * only the rail.
 *
 * The shared `activeJobId` is still the whole sync mechanism: rows and pins
 * both render from it, so hover/focus keeps working with the rail between
 * them and the map.
 *
 * One ResultsList serves both breakpoints — below `md` it is the page flow
 * (list-first, spec deliverable 9), at `md` and up the same container is
 * restyled into the rail. Mobile keeps the Show map toggle and its byte-
 * identical behavior; a bottom-sheet rail is a possible follow-up that this
 * pass deliberately does not attempt.
 */
export function SearchWorkspace({ results, stations, radiusMiles }: SearchWorkspaceProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)

  return (
    <div className="relative h-full">
      {/*
        The results: page flow on mobile, floating rail on md+. The map
        renders first in the DOM (it is the canvas), but z-index — not DOM
        order — decides the stacking, and the rail sits above it.
      */}
      <div className="relative z-10 md:absolute md:inset-y-0 md:left-0 md:w-[21rem] md:py-4 md:pl-4">
        <div
          data-testid="results-rail"
          className="md:h-full md:min-h-0 md:overflow-y-auto md:overscroll-contain md:rounded-xl md:border md:border-ink-primary/10 md:bg-white/95 md:shadow-xl md:backdrop-blur"
        >
          <ResultsList
            results={results}
            radiusMiles={radiusMiles}
            activeJobId={activeJobId}
            onActiveJobChange={setActiveJobId}
          />
        </div>
      </div>

      {/* Mobile keeps the list-first toggle; the map is a block below it. */}
      <div className="mt-6 px-4 sm:px-6 md:hidden">
        <button
          type="button"
          onClick={() => setMapOpen((open) => !open)}
          aria-expanded={mapOpen}
          className="flex w-full items-center justify-between rounded-md border border-ink-primary/15 bg-white px-4 py-2.5 text-sm font-medium text-ink-primary hover:bg-ink-primary/[0.03]"
        >
          {mapOpen ? "Hide map" : "Show map"}
          <span className="text-xs font-normal text-ink-primary/60">
            {stations.length} rail stations
          </span>
        </button>
      </div>

      {/*
        The map: a full-bleed canvas on desktop (absolute, edge to edge below
        the filter bar, fitted clear of the rail) and a toggleable block on
        mobile — one instance serves both.
      */}
      <div
        className={`${mapOpen ? "block" : "hidden"} relative mt-3 h-80 px-4 sm:px-6 md:absolute md:inset-0 md:z-0 md:mt-0 md:block md:h-auto md:px-0`}
      >
        <MapPanel
          results={results}
          stations={stations}
          activeJobId={activeJobId}
          onActiveJobChange={setActiveJobId}
          fullBleed
          scrollWheelZoom
          fitPaddingLeft={RAIL_OVERLAY_PX}
        />
      </div>
    </div>
  )
}
