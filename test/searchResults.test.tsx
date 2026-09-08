import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { NoMatches, PlatformEmpty } from "@/components/search/EmptyStates"
import { JobRow } from "@/components/search/JobRow"
import { ResultsList } from "@/components/search/ResultsList"
import { ResultsSkeleton } from "@/components/search/ResultsSkeleton"
import { DEFAULT_FILTERS, parseSearchFilters } from "@/lib/search/filters"
import type { SearchResult, SearchResultStation } from "@/lib/search/query"

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
    station: {
      stopId: "FIVE-POINTS",
      name: "Five Points",
      lines: ["BLUE", "RED"],
      location: { lng: -84.4, lat: 33.754 },
    },
    miles: 0.6,
    walkMiles: 0.75,
    ...overrides,
  }
}

describe("JobRow", () => {
  it("renders the slim row grammar: role, company, salary, walk", () => {
    render(
      <ul>
        <JobRow job={makeResult()} />
      </ul>,
    )

    expect(screen.getByRole("heading", { name: "Warehouse Lead" })).toBeInTheDocument()
    expect(screen.getByText("Northstar Logistics")).toBeInTheDocument()
    expect(screen.getByText("$38,000 – $45,000")).toBeInTheDocument()
    expect(screen.getByText("≈ 0.75 mi walk")).toBeInTheDocument()
  })

  it("leaves the station to the section header above the row", () => {
    render(
      <ul>
        <JobRow job={makeResult()} />
      </ul>,
    )

    // The station is the list's structure now, not row metadata.
    expect(screen.queryByText("Five Points")).not.toBeInTheDocument()
    expect(screen.queryByText("BLUE")).not.toBeInTheDocument()
    expect(screen.queryByText("RED")).not.toBeInTheDocument()
  })

  it("names its station again when it stands outside every group", () => {
    render(
      <ul>
        <JobRow
          job={makeResult({
            station: {
              stopId: "LENOX",
              name: "LENOX STATION",
              lines: ["RED", "GOLD"],
              location: { lng: -84.3517, lat: 33.8424 },
            },
          })}
          showStation
        />
      </ul>,
    )

    // Same naming convention as the map labels: the GTFS " STATION" suffix
    // drops, and the name is what the row is organized under.
    expect(screen.getByText("LENOX")).toBeInTheDocument()
  })

  it("marks the walk figure as an estimate", () => {
    render(
      <ul>
        <JobRow job={makeResult()} />
      </ul>,
    )
    // "≈" is the signal that this is the ×1.25 heuristic, not the geodesic
    // distance the results were filtered by.
    expect(screen.getByText("≈ 0.75 mi walk")).toBeInTheDocument()
  })

  it("says so when the employer recorded no salary", () => {
    render(
      <ul>
        <JobRow job={makeResult({ salaryMin: null, salaryMax: null })} />
      </ul>,
    )
    expect(screen.getByText("Salary not listed")).toBeInTheDocument()
  })

  it("links to the job detail page", () => {
    const job = makeResult()
    render(
      <ul>
        <JobRow job={job} />
      </ul>,
    )
    expect(screen.getByRole("link")).toHaveAttribute("href", `/jobs/${job.id}`)
  })
})

describe("ResultsList", () => {
  it("states the count and the radius it was measured within", () => {
    render(
      <ResultsList
        results={[makeResult(), makeResult({ id: "22222222-2222-2222-2222-222222222222" })]}
        radiusMiles={1}
      />,
    )

    const status = screen.getByRole("status")
    expect(status).toHaveTextContent("2 jobs within 1 mile of a MARTA rail station")
    expect(status).toHaveTextContent("grouped by closest station")
  })

  it("uses the singular for one result", () => {
    render(<ResultsList results={[makeResult()]} radiusMiles={2} />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 job within 2 miles of a MARTA rail station",
    )
  })

  it("heads the station section with its name, line dots, and count", () => {
    render(
      <ResultsList
        results={[
          makeResult(),
          makeResult({ id: "22222222-2222-2222-2222-222222222222" }),
        ]}
        radiusMiles={1}
      />,
    )

    expect(
      screen.getByRole("heading", { level: 3, name: "Five Points" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "BLUE, RED lines" })).toBeInTheDocument()
    expect(screen.getByText("2 jobs")).toBeInTheDocument()
  })

  it("folds single-job stations into a more-stations tail that names them", () => {
    render(
      <ResultsList
        results={[
          makeResult(),
          makeResult({ id: "22222222-2222-2222-2222-222222222222" }),
          makeResult({
            id: "33333333-3333-3333-3333-333333333333",
            station: {
              stopId: "MIDTOWN",
              name: "MIDTOWN STATION",
              lines: ["RED", "GOLD"],
              location: { lng: -84.388, lat: 33.7829 },
            },
          }),
        ]}
        radiusMiles={1}
      />,
    )

    // Two jobs sit under Five Points; the lone Midtown job cannot carry a
    // section, so the tail catches it — with its station on the row.
    expect(screen.getAllByRole("link")).toHaveLength(3)
    expect(
      screen.getByRole("heading", { level: 3, name: "Five Points" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 3, name: "More stations" }),
    ).toBeInTheDocument()
    expect(screen.getByText("MIDTOWN")).toBeInTheDocument()
  })

  it("gives each station its own section when both are dense", () => {
    const midtownStation: SearchResultStation = {
      stopId: "MIDTOWN",
      name: "MIDTOWN STATION",
      lines: ["RED", "GOLD"],
      location: { lng: -84.388, lat: 33.7829 },
    }
    render(
      <ResultsList
        results={[
          makeResult(),
          makeResult({ id: "22222222-2222-2222-2222-222222222222" }),
          makeResult({
            id: "33333333-3333-3333-3333-333333333333",
            station: midtownStation,
          }),
          makeResult({
            id: "44444444-4444-4444-4444-444444444444",
            station: midtownStation,
          }),
        ]}
        radiusMiles={1}
      />,
    )

    expect(
      screen.getByRole("heading", { level: 3, name: "Five Points" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 3, name: "MIDTOWN" }),
    ).toBeInTheDocument()
    expect(screen.queryByText("More stations")).not.toBeInTheDocument()
  })
})

describe("ResultsSkeleton", () => {
  it("announces that a search is running", () => {
    render(<ResultsSkeleton />)
    expect(screen.getByRole("status")).toHaveTextContent(/searching/i)
  })
})

describe("NoMatches", () => {
  const filters = parseSearchFilters({
    q: "cook",
    category: "Food Service",
    line: ["GREEN"],
  })

  it("names the filters that produced the dead end", () => {
    render(<NoMatches filters={filters} />)

    const copy = screen.getByText(/nothing within 1 mile/i)
    expect(copy).toHaveTextContent("the keyword “cook”")
    expect(copy).toHaveTextContent("the Food Service category")
    expect(copy).toHaveTextContent("the GREEN line")
  })

  it("offers one-click removal of each named filter", () => {
    render(<NoMatches filters={filters} />)

    expect(
      screen.getByRole("link", { name: "Remove the Food Service category" }),
    ).toHaveAttribute("href", "/search?q=cook&line=GREEN")
    expect(screen.getByRole("link", { name: "Remove the GREEN line" })).toHaveAttribute(
      "href",
      "/search?q=cook&category=Food+Service",
    )
  })

  it("offers the next radius up as recovery", () => {
    render(<NoMatches filters={filters} />)
    expect(screen.getByRole("link", { name: "Widen to 2 miles" })).toHaveAttribute(
      "href",
      "/search?q=cook&category=Food+Service&line=GREEN&radius=2",
    )
  })

  it("drops the widen option at the widest offered radius", () => {
    render(<NoMatches filters={{ ...DEFAULT_FILTERS, radiusMiles: 3 }} />)
    expect(screen.queryByRole("link", { name: /widen/i })).not.toBeInTheDocument()
  })

  it("offers a clear-all only when more than one filter is in force", () => {
    render(<NoMatches filters={filters} />)
    expect(screen.getByRole("link", { name: "Clear all filters" })).toHaveAttribute(
      "href",
      "/search",
    )
  })

  it("does not blame filters when none are set", () => {
    render(<NoMatches filters={DEFAULT_FILTERS} />)
    expect(screen.getByText(/no published job is currently within 1 mile/i)).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /^remove /i })).not.toBeInTheDocument()
  })
})

describe("PlatformEmpty", () => {
  it("says nothing has been posted, without blaming the seeker's filters", () => {
    const { container } = render(<PlatformEmpty />)

    expect(
      screen.getByRole("heading", { name: /no jobs have been posted yet/i }),
    ).toBeInTheDocument()
    expect(within(container).queryByText(/filter/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /widen/i })).not.toBeInTheDocument()
  })

  // The two empty states must not read as the same situation: one is a dead
  // end the seeker can escape, the other is a platform with nothing in it.
  it("is distinguishable from the no-match state", () => {
    const noMatch = render(<NoMatches filters={parseSearchFilters({ q: "cook" })} />)
    const noMatchHeading = noMatch.getByRole("heading").textContent
    noMatch.unmount()

    const empty = render(<PlatformEmpty />)
    expect(empty.getByRole("heading").textContent).not.toBe(noMatchHeading)
  })
})
