import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { JobDetailView } from "@/components/jobs/JobDetailView"
import type { JobDetail } from "@/lib/jobs/getJobDetail"

/**
 * The focused map is `next/dynamic` with `ssr: false` — under test this stub
 * stands in for the Leaflet shell (jsdom has no layout for a real L.Map, see
 * test/searchMap.test.tsx for the full rendering-layer mock). What the stub
 * pins down here is the prop handshake: the detail view must hand the shell
 * the job in focused mode plus its associated stations.
 */
vi.mock("@/components/search/MapPanel", () => ({
  default: function StubMapPanel({
    focusedJob,
    stations,
  }: {
    focusedJob?: { id: string }
    stations?: { stopId: string }[]
  }) {
    return (
      <div
        data-testid="detail-map"
        data-focused-job={focusedJob?.id ?? ""}
        data-stations={stations?.map((station) => station.stopId).join(",") ?? ""}
      />
    )
  },
}))

const fixtureJob: JobDetail = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Senior Data Analyst",
  description: "Own reporting for the ops team.",
  category: "Analytics",
  experienceLevel: "Senior",
  salaryMin: 85000,
  salaryMax: 105000,
  addressText: "100 Peachtree St NE, Atlanta, GA",
  applyUrl: "https://careers.example.test/senior-data-analyst",
  status: "published",
  location: { lng: -84.386, lat: 33.752 },
  company: {
    name: "Acme Transit Co",
    websiteUrl: "https://acmetransit.example.test",
    description: "Fictional Atlanta logistics operator.",
  },
  // Nearest-first, mirroring the order `getJobDetail` guarantees (it sorts
  // by computed ≈ walk estimate — see test/geo/distance.test.ts for that
  // math). The view trusts this order rather than re-sorting.
  stations: [
    {
      stopId: "S1",
      name: "Five Points Station",
      lines: ["BLUE", "GREEN"],
      location: { lng: -84.39, lat: 33.755 },
      walkMiles: 0.42,
    },
    {
      stopId: "S2",
      name: "Georgia State Station",
      lines: ["BLUE", "GREEN"],
      location: { lng: -84.37, lat: 33.76 },
      walkMiles: 0.91,
    },
  ],
}

describe("JobDetailView", () => {
  it("renders the fixture job's role, company, and nearest station with its ≈ walk estimate", () => {
    render(<JobDetailView job={fixtureJob} />)

    expect(screen.getByRole("heading", { name: /senior data analyst/i, level: 1 })).toBeInTheDocument()
    // "Acme Transit Co" appears both in the reading-size JobRow header and
    // the Company section below it.
    expect(screen.getAllByText("Acme Transit Co").length).toBe(2)

    // The header row (JobRow at reading size) surfaces the nearest station
    // — the fixture's first entry — with its ≈ estimate.
    expect(screen.getAllByText("Five Points Station").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/≈ 0\.42 mi walk/)[0]).toBeInTheDocument()

    // The stations section lists every association, including the farther one.
    expect(screen.getByText("Georgia State Station")).toBeInTheDocument()
    expect(screen.getByText(/≈ 0\.91 mi walk/)).toBeInTheDocument()
  })

  it("links the apply action to the employer's own destination", () => {
    render(<JobDetailView job={fixtureJob} />)
    expect(screen.getByRole("link", { name: /apply/i })).toHaveAttribute("href", fixtureJob.applyUrl)
  })

  it("flags a draft job as visible only to its owner", () => {
    render(<JobDetailView job={{ ...fixtureJob, status: "draft" }} />)
    expect(screen.getByText(/draft/i)).toBeInTheDocument()
  })

  it("does not render an apply link when the employer left it blank", () => {
    render(<JobDetailView job={{ ...fixtureJob, applyUrl: null }} />)
    expect(screen.queryByRole("link", { name: /apply/i })).not.toBeInTheDocument()
  })

  it("includes the focused map region, handed the job and its stations", async () => {
    render(<JobDetailView job={fixtureJob} />)

    const map = await screen.findByTestId("detail-map")
    expect(map).toHaveAttribute("data-focused-job", fixtureJob.id)
    expect(map).toHaveAttribute("data-stations", "S1,S2")
  })
})
