"use client"

import dynamic from "next/dynamic"

import type { FocusedJob } from "@/components/search/MapPanel"
import type { JobDetail } from "@/lib/jobs/getJobDetail"

function JobMapSkeleton() {
  return (
    <div
      role="status"
      className="flex h-80 items-center justify-center rounded-md border border-ink-primary/10 bg-white text-sm text-ink-primary/60 md:h-[26rem]"
    >
      Loading map&hellip;
    </div>
  )
}

/**
 * The map is client-only: Leaflet reaches for `window` at import time, so the
 * chunk loads after hydration and the skeleton is what both the server and
 * the first client render agree on. Same handshake as the search page —
 * one shell, two proposals.
 */
const MapPanel = dynamic(() => import("@/components/search/MapPanel"), {
  ssr: false,
  loading: () => <JobMapSkeleton />,
})

/**
 * The job detail page's focused map (Brandon's preview feedback): the same
 * MapPanel shell search uses, re-proposed to a single job — its pin in the
 * active/highlighted state, its associated stations on the map for context,
 * viewport fitted on the pin. The detail page has no list to sync with, so
 * no hover wiring crosses this boundary; the card's size is the height class
 * below and the shell draws its own border to match the page's card language.
 */
export function JobDetailMap({ job }: { job: JobDetail }) {
  const focusedJob: FocusedJob = {
    id: job.id,
    title: job.title,
    companyName: job.company.name,
    location: job.location,
  }

  return (
    <div className="h-80 md:h-[26rem]">
      <MapPanel stations={job.stations} focusedJob={focusedJob} />
    </div>
  )
}
