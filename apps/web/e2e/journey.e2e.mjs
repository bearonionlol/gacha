import { expect, test } from "./fixtures.mjs";
import { appRoutes, expectAppRoute, followCoreNavigation, openAppRoute } from "./support/app-routes.mjs";

test("Gacha to redemption works with seeded demo state and no wallet", async ({ page }) => {
  await openAppRoute(page, appRoutes.gacha);
  await expect(page.getByLabel("Wallet connection status")).toContainText("No wallet detected");
  expect(await page.evaluate(() => "ethereum" in window)).toBe(false);

  const machineStatus = page.locator("#gacha-machine-status");
  await page.getByRole("button", { name: "Try the gacha machine handle" }).click();
  await expect(machineStatus).toContainText("Capsules in motion");
  await expect(machineStatus).toContainText("Preview capsule dispensed");

  await page.getByRole("link", { name: "Keep in Vault", exact: true }).click();
  await expectAppRoute(page, appRoutes.vault);

  const vaultCard = page.getByRole("article").filter({ hasText: "Pokemon TCG Lugia V Alternate Art" });
  await expect(vaultCard).toContainText("Forge Tier 4");
  await expect(vaultCard).toContainText("Redeemable");
  await vaultCard.getByRole("link", { name: "Use as Anchor", exact: true }).click();
  await expectAppRoute(page, appRoutes.forge);

  await expect(page.getByRole("combobox", { name: "Select protected Anchor" })).toHaveValue("anchor-lugia");
  await page.getByRole("button", { name: "Auto-fill Recast", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Dust placed" })).toBeVisible();
  await page.getByRole("button", { name: "Select trade-in Charizard ex Double Rare", exact: true }).click();
  await expect(page.getByText("Blueprint matched", { exact: true })).toBeVisible();
  await expect(page.getByText("Lab recipe complete", { exact: true })).toBeVisible();

  await followCoreNavigation(page, appRoutes.market);
  const listing = page.getByRole("article").filter({ hasText: "Pokemon TCG Charizard ex" });
  await expect(listing).toContainText("Duplicate trade-in eligible");
  await expect(listing).toContainText("Illustrative escrow state only");

  await followCoreNavigation(page, appRoutes.redemption);
  const lifecycle = page.getByLabel("Redemption lifecycle states");
  for (const state of ["requested", "approved", "packed", "shipped", "completed"]) {
    await expect(lifecycle.getByText(state, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("article").filter({ hasText: "Pokemon TCG Lugia V Alternate Art" })).toContainText(
    "approved"
  );
  await expect(page.getByLabel("Wallet connection status")).toContainText("Demo available");
});
