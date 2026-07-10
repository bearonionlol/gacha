import { expect } from "@playwright/test";

export const appRoutes = {
  gacha: { path: "/", heading: "Vault Gacha", navigationName: "Gacha" },
  vault: { path: "/vault", heading: "Vault Portfolio", navigationName: "Vault" },
  forge: { path: "/forge", heading: "Vault Ascension", navigationName: "Forge" },
  market: { path: "/market", heading: "Vault Market", navigationName: "Market" },
  redemption: { path: "/redemption", heading: "Redemption Desk", navigationName: "Redeem" },
  admin: { path: "/admin/inventory", heading: "Inventory & Pool Intake", navigationName: "Admin" }
};

export async function expectAppRoute(page, route) {
  await expect(page).toHaveURL((url) => url.pathname === route.path);
  await expect(page.getByRole("heading", { level: 1, name: route.heading, exact: true })).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "Core routes" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: route.navigationName, exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );

  await expect
    .poll(() =>
      page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth))
    )
    .toBeLessThanOrEqual(1);
}

export async function openAppRoute(page, route) {
  const response = await page.goto(route.path);

  expect(response, `navigation response for ${route.path}`).not.toBeNull();
  expect(response.status(), `HTTP status for ${route.path}`).toBeLessThan(400);
  await expectAppRoute(page, route);
}

export async function followCoreNavigation(page, route) {
  await page
    .getByRole("navigation", { name: "Core routes" })
    .getByRole("link", { name: route.navigationName, exact: true })
    .click();
  await expectAppRoute(page, route);
}
