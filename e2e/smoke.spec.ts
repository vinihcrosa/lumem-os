import { expect, test } from "@playwright/test";

test("the app boots and reaches the daemon", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Lumem-OS" })).toBeVisible();
  // Proves the typed client actually round-trips to the daemon, not just that
  // React rendered something.
  await expect(page.getByText(/^daemon v/)).toBeVisible();
});
