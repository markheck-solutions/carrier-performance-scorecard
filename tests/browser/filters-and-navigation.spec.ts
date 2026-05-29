import { expect, test } from "@playwright/test";

test("filters update comparison and URL; back/forward restores state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /scope filters/i })).toBeVisible();

  // Apply a region filter.
  await page.getByLabel("Region").selectOption("emea");

  // URL should include the filter.
  await expect(page).toHaveURL(/region=emea/);

  // Apply a product filter.
  await page.getByLabel("Product type").selectOption("fiber");
  await expect(page).toHaveURL(/region=emea/);
  await expect(page).toHaveURL(/productType=fiber/);

  // Select a carrier.
  const firstCard = page.getByRole("button", { name: /rank/i }).first();
  await firstCard.click();
  await expect(page).toHaveURL(/selectedCarrierId=/);
  await expect(page.getByRole("button", { name: /^Clear$/ })).toBeVisible();

  // Back should remove selection, leaving filters.
  await page.goBack();
  await expect(page).not.toHaveURL(/selectedCarrierId=/);
  await expect(page).toHaveURL(/region=emea/);
  await expect(page).toHaveURL(/productType=fiber/);

  // Forward should restore selection.
  await page.goForward();
  await expect(page).toHaveURL(/selectedCarrierId=/);
});

test("rapid filter changes do not show stale comparison state", async ({ page }) => {
  // Delay the summary endpoint so we can force out-of-order responses.
  await page.route("**/api/scorecards/summary**", async (route) => {
    const url = new URL(route.request().url());
    const region = url.searchParams.get("region");

    // Make EMEA slower so NA finishes last even if requested second.
    const delayMs = region === "emea" ? 400 : region === "na" ? 50 : 0;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("region", { name: /scope filters/i })).toBeVisible();

  // Trigger fast changes: EMEA then NA quickly.
  await page.getByLabel("Region").selectOption("emea");
  await page.getByLabel("Region").selectOption("na");

  // Final URL must be NA.
  await expect(page).toHaveURL(/region=na/);

  // The rendered scope summary (from the API response) should reflect NA, not a stale EMEA response.
  await expect(page.getByRole("region", { name: /scope filters/i }).getByText(/Region NA/i)).toBeVisible({ timeout: 10_000 });
});

test("invalid deep link parameters are sanitized safely", async ({ page }) => {
  await page.goto("/?region=moon&productType=satellite&period=2099-01");

  // The page should render (no crash), and the URL should be sanitized to remove unsupported values.
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
  await expect(page).not.toHaveURL(/region=moon/);
  await expect(page).not.toHaveURL(/productType=satellite/);
  await expect(page).not.toHaveURL(/period=2099-01/);
});
