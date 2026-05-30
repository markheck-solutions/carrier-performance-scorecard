import { expect, test } from "@playwright/test";

test("full executive investigation flow completes end-to-end (VAL-CROSS-001)", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
  await expect(page.getByText(/demo disclosure/i).first()).toBeVisible();

  // Wait for stable baseline state before interacting.
  await expect(page.getByTestId("dashboard-settled")).toBeAttached({ timeout: 30_000 });

  // Apply scope filters.
  await page.getByLabel("Region").selectOption("emea");
  await page.getByLabel("Product type").selectOption("colocation");
  await page.getByLabel("Period").selectOption("2026-05");
  await expect(page).toHaveURL(/region=emea/);
  await expect(page).toHaveURL(/productType=colocation/);
  await expect(page).toHaveURL(/period=2026-05/);

  // Select a carrier via the comparison surface.
  const comparisonRegion = page.getByRole("region", { name: /carrier comparison and detail/i });
  await expect(comparisonRegion).toBeVisible();

  const firstCard = page.getByTestId("comparison-card").first();
  await firstCard.scrollIntoViewIfNeeded();
  await firstCard.click();
  await expect(page).toHaveURL(/selectedCarrierId=/);

  // Open evidence from a score component.
  const componentProof = page.locator('[data-evidence-origin^="dimension:"]').first();
  await componentProof.scrollIntoViewIfNeeded();
  await expect(componentProof).toBeVisible({ timeout: 10_000 });
  await componentProof.click();

  const drawer = page.getByRole("dialog", { name: /evidence drawer/i });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId("evidence-drawer-ready")).toHaveCount(1);

  // Close evidence with Escape and ensure focus stays usable.
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();

  // Generate a QBR brief for the selected carrier and scope.
  await page.getByTestId("qbr-generate").scrollIntoViewIfNeeded();
  await page.getByTestId("qbr-generate").click();
  await expect(page.getByTestId("qbr-brief")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Strengths" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Concerns" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Questions to ask" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Governance actions" })).toBeVisible();

  // Reset returns to baseline without stale selection/evidence.
  await page.getByRole("button", { name: /^Reset$/ }).click();
  await expect(page).not.toHaveURL(/selectedCarrierId=/);
  await expect(page).not.toHaveURL(/region=emea/);
  await expect(page).not.toHaveURL(/productType=colocation/);
  await expect(page).not.toHaveURL(/period=2026-05/);

  // Wait for the reset scope to settle (avoid asserting on transitional UI).
  await expect(page.getByTestId("dashboard-settled")).toBeAttached({ timeout: 30_000 });
  await expect(page.getByText(/select a carrier from the comparison list/i)).toBeVisible({ timeout: 10_000 });
});
