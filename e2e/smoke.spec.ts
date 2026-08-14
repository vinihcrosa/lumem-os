import { expect, test } from "@playwright/test";

test("the app boots and renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Lumem-OS" })).toBeVisible();
});
