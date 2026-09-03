import { describe, expect, it } from "vitest"

import {
  DEFAULT_RADIUS_MILES,
  describeActiveFilters,
  hasActiveFilters,
  nextWiderRadius,
  parseSearchFilters,
  searchHref,
  toSearchParams,
} from "@/lib/search/filters"
import { formatWalkEstimate, walkMilesFromMetres } from "@/lib/search/distance"

describe("parseSearchFilters", () => {
  it("returns the defaults for an empty query string", () => {
    expect(parseSearchFilters({})).toEqual({
      keyword: "",
      category: null,
      experienceLevel: null,
      lines: [],
      radiusMiles: 1,
      salaryMin: null,
      salaryMax: null,
    })
  })

  it("defaults the radius to one mile", () => {
    expect(DEFAULT_RADIUS_MILES).toBe(1)
    expect(parseSearchFilters({}).radiusMiles).toBe(1)
  })

  it("reads every filter off the query string", () => {
    expect(
      parseSearchFilters({
        q: "  warehouse  ",
        category: "Logistics & Warehouse",
        experience: "Entry level",
        line: ["BLUE", "GOLD"],
        radius: "2",
        salaryMin: "30000",
        salaryMax: "60000",
      }),
    ).toEqual({
      keyword: "warehouse",
      category: "Logistics & Warehouse",
      experienceLevel: "Entry level",
      lines: ["BLUE", "GOLD"],
      radiusMiles: 2,
      salaryMin: 30_000,
      salaryMax: 60_000,
    })
  })

  it("accepts a single line as a bare string", () => {
    expect(parseSearchFilters({ line: "red" }).lines).toEqual(["RED"])
  })

  it("drops duplicate and unknown lines", () => {
    expect(parseSearchFilters({ line: ["BLUE", "BLUE", "PURPLE"] }).lines).toEqual([
      "BLUE",
    ])
  })

  // A stale link or a hand-edited URL is routine on a shareable search page.
  // Each of these falls back to the default rather than throwing, so the page
  // renders the unfiltered set instead of a 500.
  it.each([
    ["an unoffered radius", { radius: "17" }, "radiusMiles", 1],
    ["a non-numeric radius", { radius: "walking" }, "radiusMiles", 1],
    ["an unknown category", { category: "Astronaut" }, "category", null],
    ["an unknown experience level", { experience: "Wizard" }, "experienceLevel", null],
    ["a negative salary", { salaryMin: "-5" }, "salaryMin", null],
    ["a non-numeric salary", { salaryMax: "lots" }, "salaryMax", null],
  ])("falls back to the default for %s", (_case, params, field, expected) => {
    const filters = parseSearchFilters(params) as Record<string, unknown>
    expect(filters[field]).toEqual(expected)
  })

  it("swaps an inverted salary range rather than matching nothing", () => {
    const filters = parseSearchFilters({ salaryMin: "90000", salaryMax: "40000" })
    expect(filters.salaryMin).toBe(40_000)
    expect(filters.salaryMax).toBe(90_000)
  })

  it("keeps a zero salary floor, which is not the same as no floor", () => {
    expect(parseSearchFilters({ salaryMin: "0" }).salaryMin).toBe(0)
  })
})

describe("toSearchParams", () => {
  it("omits everything sitting at its default", () => {
    expect(toSearchParams(parseSearchFilters({})).toString()).toBe("")
    expect(searchHref(parseSearchFilters({}))).toBe("/search")
  })

  it("round-trips a fully populated filter set", () => {
    const filters = parseSearchFilters({
      q: "cook",
      category: "Food Service",
      experience: "Entry level",
      line: ["GREEN", "RED"],
      radius: "3",
      salaryMin: "25000",
      salaryMax: "45000",
    })

    const roundTripped = parseSearchFilters(
      Object.fromEntries(
        [...toSearchParams(filters).keys()].map((key) => [
          key,
          toSearchParams(filters).getAll(key),
        ]),
      ),
    )

    expect(roundTripped).toEqual(filters)
  })

  it("repeats the line key once per selected line", () => {
    const filters = parseSearchFilters({ line: ["BLUE", "GOLD"] })
    expect(toSearchParams(filters).getAll("line")).toEqual(["BLUE", "GOLD"])
  })
})

describe("describeActiveFilters", () => {
  it("reports nothing when the search is unfiltered", () => {
    const filters = parseSearchFilters({})
    expect(describeActiveFilters(filters)).toEqual([])
    expect(hasActiveFilters(filters)).toBe(false)
  })

  it("names each filter in plain language for the no-match copy", () => {
    const described = describeActiveFilters(
      parseSearchFilters({
        q: "cook",
        category: "Food Service",
        experience: "Entry level",
        line: ["GREEN", "RED"],
        radius: "2",
        salaryMin: "30000",
        salaryMax: "50000",
      }),
    )

    expect(described).toEqual([
      "the keyword “cook”",
      "the Food Service category",
      "Entry level experience",
      "the GREEN, RED lines",
      "a 2-mile radius",
      "pay between $30,000 and $50,000",
    ])
  })

  it("uses the singular for one line", () => {
    expect(describeActiveFilters(parseSearchFilters({ line: "BLUE" }))).toEqual([
      "the BLUE line",
    ])
  })

  it("does not name the radius while it sits at the default", () => {
    expect(describeActiveFilters(parseSearchFilters({ radius: "1" }))).toEqual([])
  })

  it("describes an open-ended salary bound", () => {
    expect(describeActiveFilters(parseSearchFilters({ salaryMin: "40000" }))).toEqual([
      "pay from $40,000",
    ])
    expect(describeActiveFilters(parseSearchFilters({ salaryMax: "40000" }))).toEqual([
      "pay up to $40,000",
    ])
  })
})

describe("nextWiderRadius", () => {
  it("offers the next step up, for one-click recovery from a dead end", () => {
    expect(nextWiderRadius(0.25)).toBe(0.5)
    expect(nextWiderRadius(1)).toBe(2)
  })

  it("returns null at the widest offered radius", () => {
    expect(nextWiderRadius(3)).toBeNull()
  })
})

describe("walk estimate", () => {
  it("applies the 1.25 detour factor to the geodesic distance", () => {
    expect(walkMilesFromMetres(1609.344)).toBe(1.25)
  })

  it("marks the figure as approximate", () => {
    expect(formatWalkEstimate(0.4)).toBe("≈ 0.40 mi walk")
  })
})
