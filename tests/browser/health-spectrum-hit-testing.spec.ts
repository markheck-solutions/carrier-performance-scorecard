import { expect, test } from "@playwright/test";

test("health spectrum carrier markers are reliably clickable in first viewport (EMEA/2026-05 SBM)", async ({
  page,
}) => {
  const region = "emea";
  const period = "2026-05";

  await page.goto(`/?region=${region}&period=${period}`);
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
  await expect(page.getByTestId("dashboard-settled")).toHaveCount(1, { timeout: 15_000 });

  // Fixed demo dataset carrier id for SkyBridge MetroNet (SBM).
  const sbmCarrierId = "bbd1dc33-25c9-4d8f-b234-3a5a6d7d9f0c";

  const marker = page.getByTestId("health-spectrum-carrier-marker-sbm");
  await expect(marker).toBeVisible({ timeout: 10_000 });

  await marker.click();

  // URL reflects selection and preserves the active filters.
  await expect(page).toHaveURL(new RegExp(`region=${region}`));
  await expect(page).toHaveURL(new RegExp(`period=${period}`));
  await expect(page).toHaveURL(new RegExp(`selectedCarrierId=${sbmCarrierId}`));

  // Selected carrier detail hydrates for the exact carrier we clicked.
  const detailPanel = page
    .getByRole("heading", { name: /selected carrier detail/i })
    .locator("..")
    .locator("..")
    .locator("..");
  await expect(detailPanel.getByText(/SkyBridge MetroNet/i)).toBeVisible({ timeout: 10_000 });
  await expect(detailPanel.getByText(/\(SBM\)/)).toBeVisible();
});
