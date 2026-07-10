import { expect, test } from "./fixtures.mjs";
import { appRoutes, openAppRoute } from "./support/app-routes.mjs";

for (const route of Object.values(appRoutes)) {
  test(`${route.path} renders its primary route shell`, async ({ page }) => {
    await openAppRoute(page, route);
    await expect(page.getByLabel("Wallet connection status")).toContainText("No wallet detected");

    if (route === appRoutes.gacha) {
      const machine = page.getByRole("img", { name: /capsule gacha machine/i });
      await expect(machine).toBeVisible();
      expect(await machine.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    }

    if (route === appRoutes.admin) {
      await page.getByText("Contract-by-contract diagnosis", { exact: true }).click();
      await expect(page.locator(".deployment-contract-details li")).toHaveCount(15);
      await expect(page.getByRole("heading", { name: "Inventory Reconciliation" })).toBeVisible();
    }
  });
}
