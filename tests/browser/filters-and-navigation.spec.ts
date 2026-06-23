import { expect, test } from "@playwright/test";

test("filters update comparison and URL; back/forward restores state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /scope filters/i })).toBeVisible();
  await expect(page.getByTestId("comparison-card").first()).toBeVisible({ timeout: 10_000 });

  // Apply a region filter.
  const regionSelect = page.getByLabel("Region", { exact: true });
  await expect(regionSelect).toBeEnabled();
  await regionSelect.selectOption("emea");
  await expect(regionSelect).toHaveValue("emea");

  // URL should include the filter.
  await expect(page).toHaveURL(/region=emea/);

  // Apply a product filter.
  const productTypeSelect = page.getByLabel("Product type", { exact: true });
  await expect(productTypeSelect).toBeEnabled();
  await productTypeSelect.selectOption("fiber");
  await expect(productTypeSelect).toHaveValue("fiber");
  await expect(page).toHaveURL(/region=emea/);
  await expect(page).toHaveURL(/productType=fiber/);

  // Select a carrier.
  const firstCard = page.getByTestId("comparison-card").first();
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

  const firstCard = page.getByTestId("comparison-card").first();
  await firstCard.click();
  await expect(page).toHaveURL(/selectedCarrierId=/);

  const evidenceIdButton = page.getByRole("button", { name: /^[0-9a-f-]{36}$/i }).first();
  await evidenceIdButton.click();
  await expect(page).toHaveURL(/evidenceId=/);
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
  await expect(page.getByTestId("evidence-drawer-ready")).toHaveCount(1);

  // Back should close evidence but keep selection.
  await page.goBack();
  await expect(page).not.toHaveURL(/evidenceId=/);
  await expect(page).toHaveURL(/selectedCarrierId=/);

  // Forward should re-open evidence.
  await page.goForward();
  await expect(page).toHaveURL(/evidenceId=/);
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
  await expect(page.getByTestId("evidence-drawer-ready")).toHaveCount(1);
});

test("evidence opens from score components as a scoped proof surface", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  const firstCard = page.getByTestId("comparison-card").first();
  await firstCard.click();
  await expect(page).toHaveURL(/selectedCarrierId=/);
  const selectedCarrierId = new URL(page.url()).searchParams.get("selectedCarrierId");
  if (!selectedCarrierId) throw new Error("Expected selectedCarrierId after selecting a carrier.");

  // Open evidence via a score component proof entry point.
  const componentProof = page.locator('[data-evidence-origin^="dimension:"]').first();
  await expect(componentProof).toBeVisible({ timeout: 10_000 });
  await componentProof.click();
  await expect(page).toHaveURL(/evidenceDimension=/);
  await expect(page).toHaveURL(new RegExp(`selectedCarrierId=${selectedCarrierId}`));
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /evidence drawer/i })).toBeVisible();
  await expect(page.getByTestId("evidence-drawer-ready")).toHaveCount(1);
});

test("evidence drawer supports Escape close and returns focus to origin", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  const firstCard = page.getByTestId("comparison-card").first();
  await firstCard.click();
  await expect(page).toHaveURL(/selectedCarrierId=/);

  const evidenceIdButton = page.getByRole("button", { name: /^[0-9a-f-]{36}$/i }).first();
  await evidenceIdButton.focus();
  await expect(evidenceIdButton).toBeFocused();
  await evidenceIdButton.click();

  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
  await expect(page.getByTestId("evidence-drawer-ready")).toHaveCount(1);

  // Escape closes the drawer.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Close$/ })).not.toBeVisible();

  // Focus returns to the originating evidence id control.
  await expect(evidenceIdButton).toBeFocused();
});

test("evidence opens from executive insights (delay reasons) without workflow controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  // Open proof from a delay reason insight.
  const proofButtons = page.getByRole("button", { name: /^Proof$/ });
  await expect(proofButtons.first()).toBeVisible();
  await proofButtons.first().click();

  await expect(page).toHaveURL(/evidenceDelayReason=/);
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
  await expect(page.getByTestId("evidence-drawer-ready")).toHaveCount(1);

  // Executive-style proof surface: no operational queue controls in the drawer.
  const drawer = page.getByRole("dialog", { name: /evidence drawer/i });
  await expect(drawer.getByRole("button", { name: /assign|comment|approve|save|owner/i })).toHaveCount(0);
});

test("evidence opens from governance attention items and supports required evidence context when items exist (VAL-CARRIER-014, VAL-CARRIER-015)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  // Find a governance proof control that actually yields at least one proof item.
  const governanceProofs = page.locator('[data-evidence-origin^="governance:"]');
  const count = await governanceProofs.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const proof = governanceProofs.nth(i);
    await proof.click();

    await expect(page).toHaveURL(/selectedCarrierId=/);
    await expect(page).toHaveURL(/evidenceDimension=/);

    const drawer = page.getByRole("dialog", { name: /evidence drawer/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: /^Close$/ })).toBeVisible();
    await expect(drawer.getByTestId("evidence-drawer-ready")).toHaveCount(1);

    // Wait for the drawer to resolve to either evidence items or the scoped empty state.
    await Promise.race([
      expect(drawer.locator("article").first()).toBeVisible({ timeout: 10_000 }),
      expect(drawer.getByText(/no proof items are available/i)).toBeVisible({ timeout: 10_000 }),
    ]);

    const hasItems = (await drawer.locator("article").count()) > 0;
    if (hasItems) {
      // Required safe evidence-record context fields should be visible.
      await expect(drawer.getByText(/^Evidence ID$/)).toBeVisible();
      await expect(drawer.getByText(/^Summary$/)).toBeVisible();
      await expect(drawer.getByText(/^Carrier$/)).toBeVisible();
      await expect(drawer.getByText(/^Period$/)).toBeVisible();
      await expect(drawer.getByText(/^Region$/)).toBeVisible();
      await expect(drawer.getByText(/^Product$/)).toBeVisible();
      await expect(drawer.getByText(/^Status \/ stage$/)).toBeVisible();
      await expect(drawer.getByText(/^Delay reason$/)).toBeVisible();
      await expect(drawer.getByText(/^Timing context$/)).toBeVisible();
      await expect(drawer.getByText(/^Responsiveness \/ escalation context$/)).toBeVisible();
      return;
    }

    // Close and try the next governance proof item.
    await drawer.getByRole("button", { name: /^Close$/ }).click();
    await expect(drawer).not.toBeVisible();
  }

  throw new Error(
    "No governance proof items yielded evidence records; expected at least one to validate evidence context fields.",
  );
});

test("refresh restores filters, selection, and evidence state (VAL-CARRIER-019)", async ({ page }) => {
  // Delay filter options so deep-link UI must still show canonical values before options resolve.
  await page.route("**/api/scorecards/options", async (route) => {
    await new Promise((r) => setTimeout(r, 2_000));
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  await page.getByLabel("Region").selectOption("emea");

  // Fixed validator path: region=EMEA, period=2026-05.
  const period = "2026-05";

  // Ensure the seed includes the fixed period.
  const optionsRes = await page.request.get("/api/scorecards/options");
  expect(optionsRes.ok()).toBeTruthy();
  const options = (await optionsRes.json()) as { ok: boolean; periods?: Array<{ seedKey: string }> };
  expect(options.ok).toBeTruthy();
  const periods = options.periods?.map((p) => p.seedKey) ?? [];
  expect(periods).toContain(period);

  const summaryRes = await page.request.get(`/api/scorecards/summary?region=emea&period=${period}`);
  expect(summaryRes.ok()).toBeTruthy();
  const summary = (await summaryRes.json()) as { ok: boolean; carriers?: Array<{ carrier: { id: string } }> };
  expect(summary.ok).toBeTruthy();
  const carrierId = summary.carriers?.[0]?.carrier.id ?? null;
  expect(carrierId).toBeTruthy();

  // Include a period filter to ensure combobox + chips + detail/evidence stay coherent.
  await page.goto(`/?region=emea&period=${period}&selectedCarrierId=${carrierId}`);
  await expect(page).toHaveURL(/selectedCarrierId=/);
  await expect(page).toHaveURL(new RegExp(`period=${period}`));

  // Even while options are delayed, the period control should reflect the URL value (not blank or reset).
  await expect(page.getByLabel("Period")).toHaveValue(period);
  await expect(page.getByRole("button", { name: /^Period:/ })).toBeVisible();

  const componentProof = page.locator('[data-evidence-origin^="dimension:"]').first();
  await expect(componentProof).toBeVisible({ timeout: 10_000 });
  await componentProof.click();
  await expect(page).toHaveURL(/evidenceDimension=/);
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
  await expect(page.getByTestId("evidence-drawer-ready")).toHaveCount(1);

  const deepLink = page.url();
  await page.reload();

  await expect(page).toHaveURL(deepLink);
  await expect(page.getByLabel("Period")).toHaveValue(period);
  await expect(page.getByRole("button", { name: /^Clear$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
  await expect(page.getByTestId("dashboard-settled")).toHaveCount(1);
  await expect(page.getByTestId("evidence-drawer-ready")).toHaveCount(1);

  // Back/forward should restore the same canonical state without diverging controls.
  await page.goBack();
  await expect(page).not.toHaveURL(/evidenceDimension=/);
  await expect(page).toHaveURL(new RegExp(`period=${period}`));
  await expect(page.getByLabel("Period")).toHaveValue(period);
  await expect(page.getByRole("button", { name: /^Clear$/ })).toBeVisible();
  await expect(page.getByTestId("dashboard-settled")).toHaveCount(1);

  await page.goForward();
  await expect(page).toHaveURL(deepLink);
  await expect(page.getByLabel("Period")).toHaveValue(period);
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
  await expect(page.getByTestId("dashboard-settled")).toHaveCount(1);
  await expect(page.getByTestId("evidence-drawer-ready")).toHaveCount(1);
});

test("conflicting evidence deep-link params sanitize safely with visible recovery (VAL-CARRIER-024)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  // Build an evidence deep link from real UI state so the ids are valid.
  const firstCard = page.getByTestId("comparison-card").first();
  await firstCard.click();
  await expect(page).toHaveURL(/selectedCarrierId=/);
  const selectedCarrierId = new URL(page.url()).searchParams.get("selectedCarrierId");
  if (!selectedCarrierId) throw new Error("Expected selectedCarrierId for conflicting evidence deep link test.");

  const evidenceIdButton = page.getByRole("button", { name: /^[0-9a-f-]{36}$/i }).first();
  await expect(evidenceIdButton).toBeVisible({ timeout: 10_000 });
  const evidenceId = await evidenceIdButton.textContent();
  if (!evidenceId) throw new Error("Expected evidenceId button text.");

  const invalid = new URLSearchParams();
  invalid.set("selectedCarrierId", selectedCarrierId);
  invalid.set("evidenceId", evidenceId);
  invalid.set("evidenceDimension", "delay_severity");
  invalid.set("evidenceDelayReason", "permit");

  await page.goto(`/?${invalid.toString()}`);

  // Conflicting scope params should be sanitized to a single evidence scope.
  await expect(page).not.toHaveURL(/evidenceDimension=/);
  await expect(page).not.toHaveURL(/evidenceDelayReason=/);
  await expect(page).toHaveURL(/evidenceId=/);

  await expect(page.getByText(/conflicting parameters/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeVisible();
});

test("invalid evidenceId deep link recovers with a reset banner (VAL-CARRIER-024)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  const firstCard = page.getByTestId("comparison-card").first();
  await firstCard.click();
  await expect(page).toHaveURL(/selectedCarrierId=/);

  const selectedCarrierId = new URL(page.url()).searchParams.get("selectedCarrierId");
  if (!selectedCarrierId) throw new Error("Expected selectedCarrierId for invalid evidenceId deep link test.");

  // Use a syntactically valid UUID that will not exist in seeded demo data.
  // This should be treated as a missing/filtered proof reference (not a malformed-id error).
  await page.goto(`/?selectedCarrierId=${selectedCarrierId}&evidenceId=00000000-0000-4000-8000-000000000000`);

  await expect(page.getByText(/proof link is not available/i)).toBeVisible({ timeout: 10_000 });
  await expect(page).not.toHaveURL(/evidenceId=/);
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
  await expect(page.getByRole("region", { name: /scope filters/i }).getByText(/Region NA/i)).toBeVisible({
    timeout: 10_000,
  });
});

test("low-volume carriers show limited confidence copy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  const limited = page
    .getByTestId("comparison-card")
    .filter({ hasText: /limited sample/i })
    .first();
  await expect(limited).toBeVisible();
  await limited.click();

  await expect(page.getByText(/limited sample size/i)).toBeVisible();
});

test("filters that exclude selection clear dependent panels", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: /scope filters/i })).toBeVisible();

  const firstCard = page.getByTestId("comparison-card").first();
  await firstCard.click();
  await expect(page.getByRole("button", { name: /^Clear$/ })).toBeVisible();

  const currentUrl = page.url();
  const selectedCarrierId = new URL(currentUrl).searchParams.get("selectedCarrierId");
  expect(selectedCarrierId).toBeTruthy();

  // Apply a carrier filter to a different carrier; selection should follow the filter deterministically.
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
  await expect(page).toHaveURL(new RegExp(`selectedCarrierId=${otherCarrierId}`));
  await expect(page.getByRole("button", { name: /^Clear$/ })).toBeVisible();
});

test("invalid deep link parameters are sanitized safely", async ({ page }) => {
  await page.goto("/?region=moon&productType=satellite&period=2099-01");

  // The page should render (no crash), and the URL should be sanitized to remove unsupported values.
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
  await expect(page).not.toHaveURL(/region=moon/);
  await expect(page).not.toHaveURL(/productType=satellite/);
  await expect(page).not.toHaveURL(/period=2099-01/);

  await page.goto("/?carrierId=not-a-real-carrier");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
  await expect(page.getByText(/carrier link or filter value was not recognized and was reset/i)).toBeVisible();
  await expect(page).not.toHaveURL(/carrierId=not-a-real-carrier/);
});

test("valid deep links restore selection and evidence state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  await page.getByLabel("Region").selectOption("emea");
  await page.getByLabel("Product type").selectOption("fiber");

  const cards = page.getByTestId("comparison-card");
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });

  await cards.first().click();
  await expect(page.getByRole("button", { name: /^Clear$/ })).toBeVisible();

  // Use the score-component proof entry point so deep links are always available.
  const componentProof = page.locator('[data-evidence-origin^="dimension:"]').first();
  await expect(componentProof).toBeVisible({ timeout: 10_000 });
  await componentProof.click();
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
  await page
    .getByRole("button", { name: /^Retry$/ })
    .first()
    .click();

  // Once the retry succeeds, we should see real carrier options appear.
  await expect(
    page.getByLabel("Carrier", { exact: true }).locator("option", { hasText: /Aurora TransitLink/i }),
  ).toHaveCount(1);
});

test("failing summary request shows retryable comparison error", async ({ page }) => {
  // Fail exactly one scoped summary request so the retry button can deterministically recover.
  let failedScopedOnce = false;
  await page.route("**/api/scorecards/summary**", async (route) => {
    const url = new URL(route.request().url());
    const isScoped = url.searchParams.get("region") === "emea";
    if (!isScoped || failedScopedOnce) {
      await route.continue();
      return;
    }
    failedScopedOnce = true;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { message: "Unable to load scorecards for this scope." } }),
    });
  });

  // Deep-link to the scoped URL so this test does not depend on select-option timing.
  await page.goto("/?region=emea");
  await expect(page).toHaveURL(/region=emea/);
  await expect(page.getByRole("region", { name: /scope filters/i })).toBeVisible();
  const err = page.getByText(/unable to load scorecards for this scope/i).first();
  await expect(err).toBeVisible();

  // Retry should re-fetch and restore the comparison list.
  await err
    .locator("..")
    .getByRole("button", { name: /^Retry$/ })
    .click();
  await expect(page.getByTestId("comparison-card").first()).toBeVisible({ timeout: 10_000 });
});

test("zero-result scope shows explicit empty states across executive panels (VAL-CARRIER-004)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  // Find a filter combination that yields zero delivery records (dataset-dependent but deterministic).
  const optionsRes = await page.request.get("/api/scorecards/options");
  expect(optionsRes.ok()).toBeTruthy();
  const options = (await optionsRes.json()) as { ok: true; periods: Array<{ seedKey: string }> };
  expect(options.ok).toBeTruthy();
  const periods = options.periods.map((p) => p.seedKey);

  const regions = ["na", "emea", "apac", "latam"] as const;
  const products = ["fiber", "wireless", "colocation", "edge"] as const;

  let picked: { region: string; productType: string; period: string | null } | null = null;
  for (const region of regions) {
    for (const productType of products) {
      // Try without period first (faster), then fall back to per-period search.
      const baseRes = await page.request.get(`/api/scorecards/summary?region=${region}&productType=${productType}`);
      if (baseRes.ok()) {
        const base = (await baseRes.json()) as { ok: boolean; counts?: { deliveryRecords: number } };
        if (base.ok && (base.counts?.deliveryRecords ?? 0) === 0) {
          picked = { region, productType, period: null };
          break;
        }
      }
      for (const period of periods) {
        const res = await page.request.get(
          `/api/scorecards/summary?region=${region}&productType=${productType}&period=${period}`,
        );
        if (!res.ok()) continue;
        const payload = (await res.json()) as { ok: boolean; counts?: { deliveryRecords: number } };
        if (payload.ok && (payload.counts?.deliveryRecords ?? 0) === 0) {
          picked = { region, productType, period };
          break;
        }
      }
      if (picked) break;
    }
    if (picked) break;
  }
  expect(picked).toBeTruthy();

  // Use a deep link so the test does not depend on select-option timing.
  const query = new URLSearchParams();
  query.set("region", picked!.region);
  query.set("productType", picked!.productType);
  if (picked!.period) query.set("period", picked!.period);
  await page.goto(`/?${query.toString()}`);

  await expect(page.getByText(/no results in this scope/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/no kpis are available/i)).toBeVisible();
  await expect(page.getByText(/trend is unavailable/i)).toBeVisible();
  await expect(page.getByText(/delay concentration is unavailable/i)).toBeVisible();
});

test("selecting a comparison card populates matching carrier detail (VAL-CARRIER-008, VAL-CARRIER-009)", async ({
  page,
}) => {
  await page.goto("/");

  // Baseline (unfiltered) selection should set selectedCarrierId and render matching detail.
  const baselineCard = page.getByTestId("comparison-card").first();
  await baselineCard.click();
  await expect(page).toHaveURL(/selectedCarrierId=/);
  const baselineCarrierId = new URL(page.url()).searchParams.get("selectedCarrierId");
  if (!baselineCarrierId) throw new Error("Expected selectedCarrierId after selecting a baseline comparison card.");

  const baselineRes = await page.request.get(`/api/carriers/${baselineCarrierId}/scorecard`);
  expect(baselineRes.ok()).toBeTruthy();
  const baselinePayload = (await baselineRes.json()) as {
    ok: boolean;
    carrier: { name: string; shortCode: string } | null;
  };
  expect(baselinePayload.ok).toBeTruthy();
  expect(baselinePayload.carrier).toBeTruthy();

  const detail = page
    .getByRole("heading", { name: /selected carrier detail/i })
    .locator("..")
    .locator("..")
    .locator("..");
  await expect(detail.getByText(baselinePayload.carrier!.name, { exact: false })).toBeVisible({ timeout: 10_000 });

  // Clear baseline selection before moving to filtered scope.
  await page.getByRole("button", { name: /^Clear$/ }).click();
  await expect(page).not.toHaveURL(/selectedCarrierId=/);

  await page.getByLabel("Region").selectOption("emea");
  await expect(page).toHaveURL(/region=emea/, { timeout: 10_000 });
  const periodSelect = page.getByLabel("Period");
  await expect(periodSelect.locator("option[value='2026-05']")).toHaveCount(1, { timeout: 10_000 });
  await periodSelect.selectOption("2026-05");
  await expect(page).toHaveURL(/period=2026-05/, { timeout: 10_000 });

  const firstCard = page.getByTestId("comparison-card").first();
  await firstCard.click();

  await expect(page).toHaveURL(/selectedCarrierId=/);
  const selectedCarrierId = new URL(page.url()).searchParams.get("selectedCarrierId");
  if (!selectedCarrierId) throw new Error("Expected selectedCarrierId after selecting a comparison card.");

  // Pull the carrier identity from the API so we can assert the UI is showing the exact matching carrier.
  const res = await page.request.get(`/api/carriers/${selectedCarrierId}/scorecard?region=emea&period=2026-05`);
  expect(res.ok()).toBeTruthy();
  const payload = (await res.json()) as { ok: boolean; carrier: { name: string; shortCode: string } | null };
  expect(payload.ok).toBeTruthy();
  expect(payload.carrier).toBeTruthy();

  // Detail should render identity for the same carrier we selected.
  await expect(detail.getByText(payload.carrier!.name, { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(detail.getByText(/tier/i)).toBeVisible();
  await expect(detail.getByText(/region focus/i)).toBeVisible();
  await expect(detail.getByText(/product mix/i)).toBeVisible();
  await expect(detail.getByText(/total/i)).toBeVisible();
  await expect(detail.getByText(new RegExp(`\\(${payload.carrier!.shortCode}\\)`))).toBeVisible();
});

test("switching carriers clears stale detail and leaves exactly one selected card (VAL-CARRIER-012, VAL-CARRIER-027)", async ({
  page,
}) => {
  await page.goto("/");

  const cards = page.getByTestId("comparison-card");
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });

  // Select carrier A.
  await cards.nth(0).click();
  await expect(page).toHaveURL(/selectedCarrierId=/);
  const selectedA = new URL(page.url()).searchParams.get("selectedCarrierId");
  if (!selectedA) throw new Error("Expected selectedCarrierId for carrier A.");
  const resA = await page.request.get(`/api/carriers/${selectedA}/scorecard`);
  const payloadA = (await resA.json()) as { ok: boolean; carrier: { name: string } | null };
  expect(payloadA.ok).toBeTruthy();
  expect(payloadA.carrier).toBeTruthy();
  const detailPanel = page
    .getByRole("heading", { name: /selected carrier detail/i })
    .locator("..")
    .locator("..")
    .locator("..");
  await expect(detailPanel.getByText(payloadA.carrier!.name, { exact: false })).toBeVisible({ timeout: 10_000 });

  // Select carrier B.
  await cards.nth(1).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("selectedCarrierId"), { timeout: 10_000 })
    .not.toBe(selectedA);
  const selectedB = new URL(page.url()).searchParams.get("selectedCarrierId");
  if (!selectedB) throw new Error("Expected selectedCarrierId for carrier B.");
  expect(selectedB).not.toBe(selectedA);
  const resB = await page.request.get(`/api/carriers/${selectedB}/scorecard`);
  const payloadB = (await resB.json()) as { ok: boolean; carrier: { name: string } | null };
  expect(payloadB.ok).toBeTruthy();
  expect(payloadB.carrier).toBeTruthy();

  // During the switch, we should not see the prior carrier name lingering under the new selection.
  await expect(detailPanel.getByText(payloadA.carrier!.name, { exact: false })).not.toBeVisible();
  await expect(detailPanel.getByText(payloadB.carrier!.name, { exact: false })).toBeVisible({ timeout: 10_000 });

  // Exactly one selected card is exposed via data-selected=true.
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
});

test("existing carrier with zero records shows no-record guidance; unknown carrier shows not-found recovery (VAL-CARRIER-030)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();

  // Pick an existing carrier id from the carrier filter options.
  const carrierSelect = page.getByLabel("Carrier", { exact: true });
  await expect(carrierSelect.locator("option", { hasText: /Aurora TransitLink/i })).toHaveCount(1);
  const existingCarrierId = await carrierSelect.evaluate((el) => {
    const select = el as HTMLSelectElement;
    const values = Array.from(select.options)
      .map((o) => o.value)
      .filter((v) => v.length > 0);
    return values[0] ?? "";
  });
  expect(existingCarrierId).not.toBe("");

  // Find a deterministic filter scope that yields zero records for this existing carrier.
  const optionsRes = await page.request.get("/api/scorecards/options");
  expect(optionsRes.ok()).toBeTruthy();
  const options = (await optionsRes.json()) as { ok: true; periods: Array<{ seedKey: string }> };
  expect(options.ok).toBeTruthy();
  const periods = options.periods.map((p) => p.seedKey);

  const regions = ["na", "emea", "apac", "latam"] as const;
  const products = ["fiber", "wireless", "colocation", "edge"] as const;

  let picked: { region: string; productType: string | null; period: string | null } | null = null;
  for (const region of regions) {
    const baseRes = await page.request.get(`/api/carriers/${existingCarrierId}/scorecard?region=${region}`);
    if (baseRes.ok()) {
      const base = (await baseRes.json()) as { ok: boolean; scorecard: unknown | null; carrier: unknown | null };
      if (base.ok && base.carrier && !base.scorecard) {
        picked = { region, productType: null, period: null };
        break;
      }
    }
    for (const productType of products) {
      const productRes = await page.request.get(
        `/api/carriers/${existingCarrierId}/scorecard?region=${region}&productType=${productType}`,
      );
      if (productRes.ok()) {
        const productPayload = (await productRes.json()) as {
          ok: boolean;
          scorecard: unknown | null;
          carrier: unknown | null;
        };
        if (productPayload.ok && productPayload.carrier && !productPayload.scorecard) {
          picked = { region, productType, period: null };
          break;
        }
      }
      for (const period of periods) {
        const res = await page.request.get(
          `/api/carriers/${existingCarrierId}/scorecard?region=${region}&productType=${productType}&period=${period}`,
        );
        if (!res.ok()) continue;
        const payload = (await res.json()) as { ok: boolean; scorecard: unknown | null; carrier: unknown | null };
        if (payload.ok && payload.carrier && !payload.scorecard) {
          picked = { region, productType, period };
          break;
        }
      }
      if (picked) break;
    }
    if (picked) break;
  }
  expect(picked).toBeTruthy();

  // Use a deep link to avoid relying on rapid sequential select changes.
  const deepLinkParams = new URLSearchParams();
  deepLinkParams.set("carrierId", existingCarrierId);
  deepLinkParams.set("selectedCarrierId", existingCarrierId);
  deepLinkParams.set("region", picked!.region);
  if (picked!.productType) deepLinkParams.set("productType", picked!.productType);
  if (picked!.period) deepLinkParams.set("period", picked!.period);
  await page.goto(`/?${deepLinkParams.toString()}`);

  // Confirm the UI is truly in a zero-record state for the selected carrier under these filters.
  const verifyRes = await page.request.get(`/api/carriers/${existingCarrierId}/scorecard?${deepLinkParams.toString()}`);
  expect(verifyRes.ok()).toBeTruthy();
  const verifyPayload = (await verifyRes.json()) as { ok: boolean; carrier: unknown | null; scorecard: unknown | null };
  expect(verifyPayload.ok).toBeTruthy();
  expect(verifyPayload.carrier).toBeTruthy();
  expect(verifyPayload.scorecard).toBeNull();

  await expect(page.getByText(/no records in this scope/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /broaden scope/i })).toBeVisible();

  // Unknown carrier deep link should render a distinct not-found state with safe recovery.
  await page.goto("/?selectedCarrierId=00000000-0000-4000-8000-000000000000");
  await expect(page.getByText(/unknown carrier/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /return to overview/i })).toBeVisible();
});
