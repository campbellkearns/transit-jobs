import { describe, expect, it } from "vitest"

import { MIN_GROUP_JOBS, groupResultsByStation } from "@/lib/search/grouping"
import type { SearchResult, SearchResultStation } from "@/lib/search/query"

const FIVE_POINTS: SearchResultStation = {
  stopId: "FIVE-POINTS",
  name: "FIVE POINTS STATION",
  lines: ["BLUE", "RED", "GREEN", "GOLD"],
  location: { lng: -84.3927, lat: 33.7552 },
}

const MIDTOWN: SearchResultStation = {
  stopId: "MIDTOWN",
  name: "MIDTOWN STATION",
  lines: ["RED", "GOLD"],
  location: { lng: -84.388, lat: 33.7829 },
}

const LENOX: SearchResultStation = {
  stopId: "LENOX",
  name: "LENOX STATION",
  lines: ["RED", "GOLD"],
  location: { lng: -84.3517, lat: 33.8424 },
}

let nextId = 0

function makeResult(station: SearchResultStation): SearchResult {
  nextId += 1
  const id = `${nextId}`.padStart(8, "0")
  return {
    id,
    title: `Role ${id}`,
    companyName: "Northstar Logistics",
    category: "Logistics & Warehouse",
    experienceLevel: "Entry level",
    salaryMin: 38_000,
    salaryMax: 45_000,
    addressText: "123 Peachtree St NE",
    location: { lng: -84.4, lat: 33.75 },
    // The query hands back each job's single nearest station; these fixtures
    // place jobs wherever the query would have, so the helper's job is to
    // partition on it without a second look.
    station,
    miles: 0.4,
    walkMiles: 0.5,
  }
}

function allJobIds(grouped: ReturnType<typeof groupResultsByStation>): string[] {
  return [
    ...grouped.groups.flatMap((group) => group.jobs.map((job) => job.id)),
    ...grouped.sparse.map((job) => job.id),
  ]
}

describe("groupResultsByStation", () => {
  it("assigns each job to the station the query named as its nearest", () => {
    const fivePointsJob = makeResult(FIVE_POINTS)
    const midtownJob = makeResult(MIDTOWN)

    const { groups } = groupResultsByStation([fivePointsJob, midtownJob], 1)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.station.stopId).toBe("FIVE-POINTS")
    expect(groups[0]?.jobs.map((job) => job.id)).toEqual([fivePointsJob.id])
    expect(groups[1]?.station.stopId).toBe("MIDTOWN")
    expect(groups[1]?.jobs.map((job) => job.id)).toEqual([midtownJob.id])
  })

  it("places a job near two stations exactly once, under its nearest", () => {
    // Both jobs sit within a mile of Five Points; the query's lateral join
    // already resolved each to its single nearest station. The grouping is
    // not allowed to invent a second home for either.
    const underFivePoints = makeResult(FIVE_POINTS)
    const underMidtown = makeResult(MIDTOWN)
    const secondUnderFivePoints = makeResult(FIVE_POINTS)

    const grouped = groupResultsByStation(
      [underFivePoints, underMidtown, secondUnderFivePoints],
      1,
    )

    const ids = allJobIds(grouped)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)

    const fivePointsGroup = grouped.groups.find(
      (group) => group.station.stopId === "FIVE-POINTS",
    )
    expect(fivePointsGroup?.jobs.map((job) => job.id)).toEqual([
      underFivePoints.id,
      secondUnderFivePoints.id,
    ])
    expect(
      grouped.groups
        .find((group) => group.station.stopId === "MIDTOWN")
        ?.jobs.map((job) => job.id),
    ).toEqual([underMidtown.id])
  })

  it("orders groups by first appearance, so nearest stations lead", () => {
    const first = makeResult(LENOX)
    const second = makeResult(MIDTOWN)
    const third = makeResult(FIVE_POINTS)
    const fourth = makeResult(MIDTOWN)

    const { groups } = groupResultsByStation([first, second, third, fourth], 1)

    expect(groups.map((group) => group.station.stopId)).toEqual([
      "LENOX",
      "MIDTOWN",
      "FIVE-POINTS",
    ])
    // And jobs inside a group keep the query's nearest-walk-first order.
    expect(groups[1]?.jobs.map((job) => job.id)).toEqual([second.id, fourth.id])
  })

  it("reports each dense group's job count", () => {
    const { groups } = groupResultsByStation(
      [makeResult(FIVE_POINTS), makeResult(FIVE_POINTS), makeResult(MIDTOWN)],
      1,
    )

    expect(groups.map((group) => group.jobs.length)).toEqual([2, 1])
  })

  it("folds stations under the threshold into the sparse tail, in result order", () => {
    const denseA = makeResult(FIVE_POINTS)
    const sparseMidtown = makeResult(MIDTOWN)
    const denseB = makeResult(FIVE_POINTS)
    const sparseLenox = makeResult(LENOX)

    const { groups, sparse } = groupResultsByStation([
      denseA,
      sparseMidtown,
      denseB,
      sparseLenox,
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.station.stopId).toBe("FIVE-POINTS")
    expect(sparse.map((job) => job.id)).toEqual([sparseMidtown.id, sparseLenox.id])
  })

  it("forms a group at exactly the threshold", () => {
    const { groups, sparse } = groupResultsByStation([
      makeResult(MIDTOWN),
      makeResult(MIDTOWN),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.jobs).toHaveLength(2)
    expect(sparse).toEqual([])
  })

  it("honours a raised threshold", () => {
    const { groups, sparse } = groupResultsByStation(
      [makeResult(FIVE_POINTS), makeResult(FIVE_POINTS), makeResult(MIDTOWN)],
      3,
    )

    expect(groups).toEqual([])
    expect(sparse).toHaveLength(3)
  })

  it("collapses nothing when every station clears the threshold", () => {
    const { groups, sparse } = groupResultsByStation([
      makeResult(FIVE_POINTS),
      makeResult(FIVE_POINTS),
      makeResult(MIDTOWN),
      makeResult(MIDTOWN),
    ])

    expect(groups).toHaveLength(2)
    expect(sparse).toEqual([])
  })

  it("answers an empty result set with no structure at all", () => {
    expect(groupResultsByStation([])).toEqual({ groups: [], sparse: [] })
  })

  it("uses two jobs as the default threshold", () => {
    expect(MIN_GROUP_JOBS).toBe(2)
  })
})
