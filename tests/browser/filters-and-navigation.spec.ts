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

test("browser navigation restores evidence drawer state", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Region").selectOption("emea");

  const firstCard = page.getByRole("button", { name: /rank/i }).first();
  await firstCard.click();
  await expect(page).toHaveURL(/selectedCarrierId=/);

  const evidenceIdButton = page.getByRole("button", { name: /^[0-9a-f-]{36}$/i }).first();
  await evidenceIdButton.click();
  await expect(page).toHaveURL(/evidenceId=/);
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();

  // Back should close evidence but keep selection.
  await page.goBack();
  await expect(page).not.toHaveURL(/evidenceId=/);
  await expect(page).toHaveURL(/selectedCarrierId=/);

  // Forward should re-open evidence.
  await page.goForward();
  await expect(page).toHaveURL(/evidenceId=/);
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
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

test("low-volume carriers show limited confidence copy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  const limited = page.getByRole("button", { name: /limited sample/i }).first();
  await expect(limited).toBeVisible();
  await limited.click();

  await expect(page.getByText(/limited sample size/i)).toBeVisible();
});

test("filters that exclude selection clear dependent panels", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: /scope filters/i })).toBeVisible();

  const firstCard = page.getByRole("button", { name: /rank/i }).first();
  await firstCard.click();
  await expect(page.getByRole("button", { name: /^Clear$/ })).toBeVisible();

  const currentUrl = page.url();
  const selectedCarrierId = new URL(currentUrl).searchParams.get("selectedCarrierId");
  expect(selectedCarrierId).toBeTruthy();

  // Apply a carrier filter to a different carrier, which should invalidate the selection.
  const carrierSelect = page.getByLabel("Carrier", { exact: true });
  const otherCarrierId = await carrierSelect.evaluate((el, selectedId) => {
    const select = el as HTMLSelectElement;
    const candidates = Array.from(select.options)
      .map((o) => o.value)
      .filter((v) => v.length > 0 && v !== selectedId);
    return candidates[0] ?? "";
  }, selectedCarrierId);
  expect(otherCarrierId).not.toBe("");
  await carrierSelect.selectOption(otherCarrierId);
  await expect(page).not.toHaveURL(/selectedCarrierId=/);
  await expect(page.getByRole("button", { name: /^Clear$/ })).not.toBeVisible();
});

test("invalid deep link parameters are sanitized safely", async ({ page }) => {
  await page.goto("/?region=moon&productType=satellite&period=2099-01");

  // The page should render (no crash), and the URL should be sanitized to remove unsupported values.
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
  await expect(page).not.toHaveURL(/region=moon/);
  await expect(page).not.toHaveURL(/productType=satellite/);
  await expect(page).not.toHaveURL(/period=2099-01/);
});

test("valid deep links restore selection and evidence state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  await page.getByLabel("Region").selectOption("emea");
  await page.getByLabel("Product type").selectOption("fiber");

  const cards = page.getByRole("button", { name: /rank/i });
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });

  let openedEvidence = false;
  const cardCount = await cards.count();
  for (let i = 0; i < Math.min(cardCount, 5); i += 1) {
    await cards.nth(i).click();
    await expect(page.getByRole("button", { name: /^Clear$/ })).toBeVisible();

    const evidenceButtons = page.getByRole("button", { name: /^[0-9a-f-]{36}$/i });
    try {
      await evidenceButtons.first().waitFor({ state: "visible", timeout: 3_000 });
      await evidenceButtons.first().click();
      openedEvidence = true;
      break;
    } catch {
      // Try the next carrier card.
    }
  }

  expect(openedEvidence).toBe(true);
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();

  const deepLink = page.url();
  await page.goto(deepLink);

  await expect(page.getByRole("button", { name: /^Clear$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
});

test("failing filter options request shows retryable state", async ({ page }) => {
  let shouldFail = true;
  await page.route("**/api/scorecards/options", async (route) => {
    if (shouldFail) {
      shouldFail = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { message: "boom" } }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByText(/unable to load filter options/i)).toBeVisible();
  await page.getByRole("button", { name: /^Retry$/ }).first().click();

  // Once the retry succeeds, we should see real carrier options appear.
  await expect(page.getByLabel("Carrier", { exact: true }).locator("option", { hasText: /Aurora TransitLink/i })).toHaveCount(1);
});

test("failing summary request shows retryable comparison error", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: /scope filters/i })).toBeVisible();

  // Fail the next summary fetch triggered by filter change.
  let failNext = true;
  await page.route("**/api/scorecards/summary**", async (route) => {
    if (!failNext) {
      await route.continue();
      return;
    }
    failNext = false;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { message: "Unable to load scorecards for this scope." } }),
    });
  });

  await page.getByLabel("Region").selectOption("emea");
  await expect(page.getByText(/unable to load scorecards for this scope/i).first()).toBeVisible();

  // Retry should re-fetch and restore the comparison list.
  await page.getByRole("button", { name: /^Retry$/ }).first().click();
  await expect(page.getByRole("button", { name: /rank/i }).first()).toBeVisible({ timeout: 10_000 });
});
