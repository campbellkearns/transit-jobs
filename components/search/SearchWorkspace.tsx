"use client"

import dynamic from "next/dynamic"
import { useState } from "react"

import type { SearchResult, SearchResultStation } from "@/lib/search/query"

import { ResultsList } from "./ResultsList"

function MapPanelSkeleton() {
  return (
    <div
      role="status"
      className="flex h-80 items-center justify-center rounded-md border border-ink-primary/10 bg-white text-sm text-ink-primary/60 md:h-[560px]"
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
 * The combined map + list view (UI direction art_cJdHuq28).
 *
 * Desktop: list left, map right, kept in sync — hovering or focusing a row
 * highlights that job's pin, and hovering a pin highlights its row. The
 * shared `activeJobId` is the whole sync mechanism: both halves render from
 * it, so neither can drift from the other.
 *
 * Mobile (375px, spec deliverable 9): the list is the product, so it comes
 * first and the map sits behind a toggle rather than pushing every result
 * below the fold.
 */
export function SearchWorkspace({ results, stations, radiusMiles }: SearchWorkspaceProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)

  return (
    <div className="md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start md:gap-6">
      <div className="min-w-0">
        <ResultsList
          results={results}
          radiusMiles={radiusMiles}
          activeJobId={activeJobId}
          onActiveJobChange={setActiveJobId}
        />
      </div>

      <div className="mt-6 px-4 sm:px-6 md:sticky md:top-4 md:mt-0 md:px-0">
        <button
          type="button"
          onClick={() => setMapOpen((open) => !open)}
          aria-expanded={mapOpen}
          className="flex w-full items-center justify-between rounded-md border border-ink-primary/15 bg-white px-4 py-2.5 text-sm font-medium text-ink-primary hover:bg-ink-primary/[0.03] md:hidden"
        >
          {mapOpen ? "Hide map" : "Show map"}
          <span className="text-xs font-normal text-ink-primary/60">
            {stations.length} rail stations
          </span>
        </button>

        <div className={`${mapOpen ? "block" : "hidden"} mt-3 md:mt-0 md:block`}>
          <MapPanel
            results={results}
            stations={stations}
            activeJobId={activeJobId}
            onActiveJobChange={setActiveJobId}
          />
        </div>
      </div>
    </div>
  )
}
