import { Suspense } from "react"
import type { Metadata } from "next"

import { FilterBar } from "@/components/search/FilterBar"
import { NoMatches, PlatformEmpty } from "@/components/search/EmptyStates"
import { ResultsSkeleton } from "@/components/search/ResultsSkeleton"
import { SearchWorkspace } from "@/components/search/SearchWorkspace"
import {
  parseSearchFilters,
  toSearchParams,
  type RawSearchParams,
  type SearchFilters,
} from "@/lib/search/filters"
import { countPublishedJobs, listStations, searchJobs } from "@/lib/search/query"

export const metadata: Metadata = {
  title: "Search jobs · Transit to Work",
  description:
    "Search Atlanta jobs by MARTA line, walking distance, category, experience, and salary.",
}

/**
 * Runs the search and picks the state to render.
 *
 * Split out from the page so it can sit behind its own Suspense boundary: the
 * filter bar is rendered from the URL alone and paints immediately, while the
 * PostGIS round trip streams in under skeleton rows.
 *
 * The published-job count is only fetched when the result set is empty. That
 * is the one moment the distinction matters — "your filters exclude
 * everything" and "no employer has posted yet" need different copy and
 * different recovery — and paying for the count on every successful search
 * would buy nothing.
 */
async function SearchResults({ filters }: { filters: SearchFilters }) {
  const results = await searchJobs(filters)

  if (results.length > 0) {
    // Stations are fetched only when there is something to plot beside —
    // the empty states own the whole viewport, and a map adds nothing to
    // "no jobs posted yet" that the recovery copy does not.
    const stations = await listStations()
    return (
      <SearchWorkspace
        results={results}
        stations={stations}
        radiusMiles={filters.radiusMiles}
      />
    )
  }

  const publishedCount = await countPublishedJobs()
  return publishedCount === 0 ? <PlatformEmpty /> : <NoMatches filters={filters} />
}

type SearchPageProps = {
  searchParams: Promise<RawSearchParams>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const filters = parseSearchFilters(await searchParams)

  return (
    <main className="mx-auto min-h-screen max-w-5xl pb-16">
      <header className="px-4 pt-10 pb-5 sm:px-6">
        <p className="text-sm uppercase tracking-wide text-ink-primary/60">
          Transit to Work
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ink-primary">
          Jobs within walking distance of MARTA rail
        </h1>
      </header>

      <FilterBar filters={filters} />

      {/*
        Keyed on the query string so a new search remounts the boundary and
        shows skeleton rows again. Without the key, React would keep the
        previous results on screen during the next query — the seeker would
        read a stale list as the answer to the filter they just changed.
      */}
      <Suspense key={toSearchParams(filters).toString()} fallback={<ResultsSkeleton />}>
        <SearchResults filters={filters} />
      </Suspense>
    </main>
  )
}
