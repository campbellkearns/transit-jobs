import { expect, test } from "@playwright/test"

test("home page renders the marketplace headline", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: /jobs within a mile of marta rail/i })
  ).toBeVisible()
})
