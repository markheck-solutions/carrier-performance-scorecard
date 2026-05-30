import { expect, test } from "@playwright/test";

async function getBriefText(page: import("@playwright/test").Page) {
  const root = page.getByTestId("qbr-brief");
  await expect(root).toBeVisible();
  return await root.innerText();
}

test("QBR brief generates required sections and varies by carrier and filters", async ({ page }) => {
  await page.goto("/");

  // Wait for stable baseline state.
  await expect(page.getByTestId("dashboard-settled")).toBeAttached();

  // Select a carrier using the filter, which also sets the selectedCarrierId and loads detail.
  await page.selectOption("#carrier-filter", { index: 1 });
  await expect(page.getByText(/Selected carrier detail/i)).toBeVisible();

  await page.getByTestId("qbr-generate").click();

  const first = await getBriefText(page);
  await expect(page.getByRole("heading", { name: "Strengths" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Concerns" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Questions to ask" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Governance actions" })).toBeVisible();

  // Switch carrier and regenerate.
  await page.selectOption("#carrier-filter", { index: 2 });
  await page.getByTestId("qbr-generate").click();
  const second = await getBriefText(page);

  expect(second).not.toEqual(first);

  // Filters should influence the brief scope language.
  await page.selectOption("#region-filter", "emea");
  await page.getByTestId("qbr-generate").click();
  const filtered = await getBriefText(page);
  expect(filtered).not.toEqual(second);
  expect(filtered).toMatch(/EMEA/i);
});
