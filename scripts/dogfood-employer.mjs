// One-off Playwright dogfood script for T4 (employer job CRUD).
// Not part of the test suite — run manually against a live dev server to
// capture screenshot evidence of the real browser flow before merge.
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const BASE_URL = process.env.DOGFOOD_BASE_URL ?? "http://localhost:3100"
const OUT_DIR = "/home/user/work/transit-jobs/.dogfood-screenshots"
mkdirSync(OUT_DIR, { recursive: true })

const email = `dogfood-employer-${Date.now()}@example.com`
const password = "correct-horse-battery-staple"

// Airport Station (stop_id 510037), projected via the same ST_Project
// helper the integration tests use (test/helpers/geo.ts):
//   0.5mi  -> success pin
//   1.01mi -> rejection pin, naming this station
const PIN_OK = { lng: -84.43754033164502, lat: 33.6408056957904 }
const PIN_FAIL = { lng: -84.4286931947923, lat: 33.64080475870384 }

async function shot(page, name) {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: true })
  console.log(`captured ${name}`)
}

async function run() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  // 1. Register a fresh employer account.
  await page.goto(`${BASE_URL}/register`)
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.check('input[name="role"][value="employer"]')
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE_URL}/`)

  // 2. Empty dashboard.
  await page.goto(`${BASE_URL}/employer/jobs`)
  await shot(page, "01-dashboard-empty")

  // 3. New job form — fill role basics, location, and one station.
  await page.click('a[href="/employer/jobs/new"]')
  await page.waitForURL(`${BASE_URL}/employer/jobs/new`)
  await page.getByLabel("Job title").fill("Ramp Agent")
  await page.getByLabel("Description").fill("Loads and unloads aircraft baggage on the tarmac.")
  await page.getByLabel("Office address").fill("6000 N Terminal Pkwy, Atlanta, GA 30320")
  await page.getByLabel("Pin latitude").fill(String(PIN_OK.lat))
  await page.getByLabel("Pin longitude").fill(String(PIN_OK.lng))
  // Airport Station serves both GOLD and RED — it appears once per line
  // group (StationPicker groups by line); either checkbox shares the same
  // selection state, so checking the first is sufficient.
  await page.getByRole("checkbox", { name: /AIRPORT STATION/i }).first().check()
  await shot(page, "02-new-job-filled")

  // 4. Publish with a station within one mile — should succeed.
  await page.getByRole("button", { name: "Publish" }).click()
  await page.waitForURL(/\/employer\/jobs\/.+\/edit/)
  await page.getByText("Published — visible to seekers now.").waitFor()
  await shot(page, "03-publish-success")

  const editUrl = page.url()
  const jobId = editUrl.match(/\/employer\/jobs\/([^/]+)\/edit/)?.[1]
  console.log(`created job ${jobId}`)

  // 5. Unpublish, then move the pin 1.01 miles away and try to republish
  //    — should reject, naming the offending station.
  await page.getByRole("button", { name: "Unpublish" }).click()
  await page.getByText("Unpublished — back to draft.").waitFor()
  await shot(page, "04-unpublished")

  await page.getByLabel("Pin latitude").fill(String(PIN_FAIL.lat))
  await page.getByLabel("Pin longitude").fill(String(PIN_FAIL.lng))
  await page.getByRole("button", { name: "Publish" }).click()
  // The static section copy ( "...more than one mile from the pin..." )
  // is always on screen, so it would match immediately — before the
  // request even resolves — and capture the screenshot mid-flight
  // ("Publishing...", no violation shown yet). "Fix the pair named below"
  // only appears in the 422 error banner this specific request produces.
  await page.getByText(/Fix the pair named below/i).waitFor({ timeout: 10_000 })
  await shot(page, "05-publish-rejected-1.01mi")

  await browser.close()
  console.log("dogfood run complete")
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
