import { expect, test } from "@playwright/test"

import { ANCHOR, POSTED_JOB, fillJobForm, registerViaUi, uniqueJobTitle } from "./helpers"

/**
 * The release happy path, end to end against the seeded database (spec
 * deliverable 9): an employer registers, posts a pinned job within a mile
 * of a station, and publishes; a stranger then searches, filters, and
 * finds it on the list and the map, and opens a detail page whose walk
 * estimate and apply link are real.
 *
 * One test, deliberately serial: the seeker half consumes the id the
 * employer half created. Splitting it would mean coordinating two workers
 * for no isolation gain — the flow has exactly one order.
 */
test("employer posts a job near a station; a seeker finds it and applies", async ({
  page,
  browser,
}) => {
  // ── Employer: register, post, publish ────────────────────────────────
  await registerViaUi(page, "employer")

  // A run-unique title: retries and a reused local database must never turn
  // the keyword search below into a multi-match.
  const jobTitle = uniqueJobTitle()

  await fillJobForm(page, jobTitle)
  await page.getByRole("button", { name: "Publish" }).click()

  // The publish round-trip ends on the job's stable edit URL; the status
  // chip there is server-rendered from the row itself, so it can't lie
  // about the write the way a client-only notice could.
  await page.waitForURL(/\/employer\/jobs\/[0-9a-f-]{36}\/edit\?notice=published/)
  await expect(page.getByText("Published", { exact: true })).toBeVisible()

  const jobId = new URL(page.url()).pathname.split("/")[3]

  // ── Seeker: a stranger searches, filters, finds, opens, applies ──────
  const stranger = await browser.newContext()
  const seeker = await stranger.newPage()

  await seeker.goto("/search")
  await seeker.getByPlaceholder("Role, company, or keyword").fill(jobTitle)
  await seeker.getByRole("button", { name: "Search" }).click()
  await expect(seeker.getByText("1 job within 1 mile")).toBeVisible()

  const resultRow = seeker.locator(`ul li a[href="/jobs/${jobId}"]`)
  await expect(resultRow).toHaveCount(1)

  // Filters are live: the GOLD line checkbox and the walking radius both
  // auto-submit, and the posting survives both — it is near a GOLD station
  // and 0.25 geodesic miles from it.
  await seeker.getByRole("checkbox", { name: ANCHOR.line }).check()
  await expect(seeker.getByText("1 job within 1 mile")).toBeVisible()
  await seeker.getByLabel("Walking radius").selectOption({ label: "0.5 miles" })
  await expect(seeker.getByText("1 job within 0.5 miles")).toBeVisible()

  // Found on the map as well as the list: one pin per result row, and the
  // filtered result set still contains the posting.
  await expect(seeker.locator("ul li a[href]")).toHaveCount(1)
  const pins = seeker.locator(".map-job-pin")
  await expect(pins).toHaveCount(1)

  // The detail page tells the whole story: the ≈ walk estimate is the
  // read-time geodesic × 1.25 figure (not the employer's claim), and the
  // apply link points where the employer recorded.
  await resultRow.click()
  await expect(seeker).toHaveURL(new RegExp(`/jobs/${jobId}$`))
  await expect(seeker.getByRole("heading", { name: jobTitle })).toBeVisible()
  // The estimate renders twice (header row + stations list); either
  // instance proves the read-time figure.
  await expect(seeker.getByText(ANCHOR.walkMilesPattern).first()).toBeVisible()
  await expect(seeker.getByRole("link", { name: /Apply/ })).toHaveAttribute(
    "href",
    POSTED_JOB.applyUrl,
  )

  // ── Layout usability at phone width (spec deliverable 9) ─────────────
  await seeker.setViewportSize({ width: 375, height: 812 })

  await seeker.goto("/search")
  // The list leads; the map stays behind its toggle, and nothing overflows
  // the 375px viewport horizontally.
  await expect(seeker.locator(".leaflet-container")).toHaveCount(0)
  await seeker.getByRole("button", { name: /show map/i }).click()
  await expect(seeker.locator(".leaflet-container")).toBeVisible()
  const searchOverflow = await seeker.evaluate(() => document.documentElement.scrollWidth)
  expect(searchOverflow).toBeLessThanOrEqual(375)

  await seeker.goto(`/jobs/${jobId}`)
  await expect(seeker.getByRole("heading", { name: jobTitle })).toBeVisible()
  const detailOverflow = await seeker.evaluate(() => document.documentElement.scrollWidth)
  expect(detailOverflow).toBeLessThanOrEqual(375)

  await stranger.close()
})
