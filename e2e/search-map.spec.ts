import { expect, test } from "@playwright/test"

/**
 * T7 — the map + list search view, against the seeded database (38 stations,
 * 24 published jobs). Spec deliverable 6: markers for every seeded station,
 * OSM/ODbL attribution visible on the map itself, no hydration errors.
 *
 * These specs are wired into the CI gate in T9; locally, run against a seeded
 * database (`npm run db:setup && npm run db:seed` with DATABASE_URL set).
 */
test.describe("search map", () => {
  test("renders station markers, job pins, and attribution on /search", async ({ page }) => {
    const hydrationErrors: string[] = []
    page.on("console", (message) => {
      // Tile fetches can fail in offline environments; hydration breakage
      // cannot — that is the acceptance criterion this watches.
      if (message.type() === "error" && /hydrat/i.test(message.text())) {
        hydrationErrors.push(message.text())
      }
    })

    await page.goto("/search")

    const map = page.locator(".leaflet-container")
    await expect(map).toBeVisible()

    // Every seeded station is on the map, each with a name label (the
    // label drops the GTFS " STATION" suffix — see stationLabel).
    const stationMarkers = page.locator(".map-station-marker")
    await expect(stationMarkers).toHaveCount(38)
    await expect(page.locator(".map-station-name")).toHaveCount(38)
    await expect(stationMarkers.first()).toContainText(/\S/)

    // The search's results are pins on the map — one per result row.
    const jobPins = page.locator(".map-job-pin")
    await expect(jobPins).toHaveCount(await page.locator("ul li a").count())
    expect(await jobPins.count()).toBeGreaterThan(0)

    // Spec deliverable 6: attribution lives on the map, not in a footer.
    const attribution = page.locator(".leaflet-control-attribution")
    await expect(attribution).toContainText("© OpenStreetMap contributors")
    await expect(attribution).toContainText("ODbL")

    expect(hydrationErrors).toEqual([])
  })

  test("keeps the map and the list in sync", async ({ page }) => {
    await page.goto("/search")

    const firstRow = page.locator("ul li a").first()
    await firstRow.hover()

    // Hovering a row highlights exactly its pin; the row is marked active.
    await expect(page.locator("ul li a[data-active]")).toHaveCount(1)
    await expect(page.locator(".map-job-pin.is-active")).toHaveCount(1)

    // And the reverse: hovering a pin highlights its row.
    await page.locator(".map-job-pin").first().hover({ force: true })
    await expect(page.locator("ul li a[data-active]")).toHaveCount(1)
  })

  test("puts the map behind a toggle at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/search")

    // List first; the map is collapsed until asked for (spec deliverable 9).
    await expect(page.locator(".leaflet-container")).toHaveCount(0)
    await expect(page.getByRole("status")).toContainText(/jobs within/i)

    await page.getByRole("button", { name: /show map/i }).click()
    await expect(page.locator(".leaflet-container")).toBeVisible()
    await expect(page.locator(".map-station-marker")).toHaveCount(38)
  })
})
