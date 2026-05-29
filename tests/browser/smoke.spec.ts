import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
  await expect(page.getByText(/demo disclosure/i).first()).toBeVisible();
  await expect(page.getByText(/carrier health spectrum/i).first()).toBeVisible();
});
