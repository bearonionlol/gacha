import { expect, test as base } from "@playwright/test";

export const test = base.extend({
  assertNoBrowserFailures: [
    async ({ baseURL, context, page }, use) => {
      const failures = [];
      const appOrigin = new URL(baseURL).origin;

      await context.route("**/*", async (route) => {
        const requestURL = new URL(route.request().url());

        if (requestURL.origin === appOrigin) {
          await route.continue();
          return;
        }

        failures.push(`External request blocked: ${route.request().method()} ${requestURL.href}`);
        await route.abort("blockedbyclient");
      });

      page.on("pageerror", (error) => failures.push(`Unhandled page error: ${error.message}`));
      page.on("response", (response) => {
        if (response.request().resourceType() === "document" && response.status() >= 400) {
          failures.push(`Document request failed: ${response.status()} ${response.url()}`);
        }
      });

      await use();

      expect(failures, "browser runtime failures").toEqual([]);
    },
    { auto: true }
  ]
});

export { expect };
