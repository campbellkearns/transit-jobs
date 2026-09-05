import { expect, test } from "@playwright/test"

import { fillJobForm, registerViaUi } from "./helpers"

/**
 * The draft-404 contract (spec deliverable 7, exercised through real
 * registration and a real save-as-draft flow): a saved draft is visible to
 * its owning employer and 404s for everyone else — with the same 404 a
 * made-up id gets, so a non-owner can't distinguish "doesn't exist" from
 * "exists but is a draft".
 */
test("a draft job is visible only to its owner and 404s for everyone else", async ({
  page,
  browser,
}) => {
  await registerViaUi(page, "employer")

  await fillJobForm(page)
  await page.getByRole("button", { name: "Save draft" }).click()

  // Saving redirects to the stable edit URL, which carries the id — the
  // same id a real employer would copy out of their address bar.
  await page.waitForURL(/\/employer\/jobs\/[0-9a-f-]{36}\/edit\?notice=draft/)
  const jobId = new URL(page.url()).pathname.split("/")[3]

  // The owner sees the draft, wearing its draft banner.
  await page.goto(`/jobs/${jobId}`)
  await expect(page.getByText("Draft — visible only to you until published.")).toBeVisible()

  // A stranger with no session gets the same 404 a fabricated id gets.
  const stranger = await browser.newContext()
  const strangerPage = await stranger.newPage()

  const draftResponse = await strangerPage.goto(`/jobs/${jobId}`)
  expect(draftResponse?.status()).toBe(404)
  await expect(strangerPage.getByText("This page could not be found.")).toBeVisible()

  const fakeResponse = await strangerPage.goto("/jobs/11111111-1111-4111-8111-111111111111")
  expect(fakeResponse?.status()).toBe(404)

  await stranger.close()
})
