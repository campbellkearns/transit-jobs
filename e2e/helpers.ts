import type { Page } from "@playwright/test"

/**
 * Shared fixtures for the release-gate E2E specs (T9).
 *
 * The anchor is a real station from the pinned GTFS feed, chosen for the
 * same reason the seed picks its own pins: the facts the specs assert are
 * true by construction, not by luck.
 *
 * DORAVILLE STATION (stop 510010) is GOLD-only and the line's northern
 * terminus, so a `line=GOLD` radius search near it cannot accidentally
 * resolve to a BLUE/RED/GREEN station the way a hub (Five Points) would.
 * The pin sits 0.25 mi due east of the platform (spherical destination
 * formula, same math as `db/seed-content.ts`), so the read-time walk
 * estimate is a fixed 0.25 × 1.25 ≈ 0.31 mi and the publish-time
 * one-mile server check passes with room to spare.
 */
export const ANCHOR = {
  name: "DORAVILLE STATION",
  line: "GOLD",
  stationLat: 33.90296,
  stationLng: -84.28026,
  /** 0.25 mi east of the platform — the pin the employer form types in. */
  pin: { lat: "33.902960", lng: "-84.275901" },
  walkMilesPattern: /≈ 0\.31 mi walk/,
} as const

/**
 * The job the employer persona posts. The title is invented, and every run
 * appends a fresh token (`uniqueJobTitle`) — a keyword search for a run's
 * title can only ever match that run's posting, even across retries and
 * against a local database that accumulates earlier runs' postings.
 */
export const POSTED_JOB = {
  title: "Transit Anchor Cafe Lead",
  description:
    "Anchor posting for the release gate: a cafe lead role 0.25 miles from the Doraville platform.",
  address: "6000 New Peachtree Rd NE, Atlanta, GA",
  salaryMin: "38000",
  salaryMax: "42000",
  applyUrl: "https://jobs.example.com/apply/transit-anchor-cafe-lead",
} as const

const E2E_PASSWORD = "marta-e2e-release-gate"

/** A fresh address every call: parallel specs and CI retries must never collide on the users table's unique email. */
export function uniqueEmail(role: string): string {
  return `e2e-${role}-${crypto.randomUUID()}@example.com`
}

/**
 * Registers through the real UI (server action → credentials sign-in →
 * redirect home) so the session cookie the rest of the test uses is the
 * one a real registrant gets. `role` picks the same radio a human picks.
 */
export async function registerViaUi(page: Page, role: "employer" | "seeker"): Promise<string> {
  const email = uniqueEmail(role)

  await page.goto("/register")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(E2E_PASSWORD)
  await page.getByRole("radio", { name: role === "employer" ? "Employer" : "Job seeker" }).check()
  await page.getByRole("button", { name: "Create account" }).click()
  await page.waitForURL("/")

  return email
}

/** A title unique to this run, built on the shared posting's base title. */
export function uniqueJobTitle(): string {
  return `${POSTED_JOB.title} ${crypto.randomUUID().slice(0, 8)}`
}

/**
 * Fills the employer job form on `/employer/jobs/new` with a complete,
 * publishable posting near the anchor station. Does not submit — the specs
 * choose between "Save draft" and "Publish". `title` defaults to the shared
 * base; the happy path passes a run-unique one (see `uniqueJobTitle`).
 */
export async function fillJobForm(page: Page, title: string = POSTED_JOB.title): Promise<void> {
  await page.goto("/employer/jobs/new")
  await page.getByRole("heading", { name: "Post a job" }).waitFor()

  await page.getByLabel("Job title").fill(title)
  await page.getByLabel("Description").fill(POSTED_JOB.description)
  await page.getByLabel("Salary min (USD/yr)").fill(POSTED_JOB.salaryMin)
  await page.getByLabel("Salary max (USD/yr)").fill(POSTED_JOB.salaryMax)
  await page.getByLabel("Application URL (optional)").fill(POSTED_JOB.applyUrl)
  await page.getByLabel("Office address").fill(POSTED_JOB.address)
  await page.getByLabel("Pin latitude").fill(ANCHOR.pin.lat)
  await page.getByLabel("Pin longitude").fill(ANCHOR.pin.lng)

  // The picker's checkboxes are labelled by station name; the walk-claim
  // input that appears on check defaults to 0.50 mi, which is inside the
  // one-mile claim bound and left as the employer's honest claim.
  await page.getByRole("checkbox", { name: ANCHOR.name }).check()
}
