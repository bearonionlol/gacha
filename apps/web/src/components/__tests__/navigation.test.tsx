import { render, screen, within } from "@testing-library/react";
import { AppShell } from "../app-shell";

describe("app navigation", () => {
  it("exposes every core route", () => {
    render(
      <AppShell>
        <main>content</main>
      </AppShell>
    );

    const routeNav = screen.getByRole("navigation", { name: /Core routes/i });

    for (const label of ["Home", "Vault", "Market", "Forge", "Redeem", "Admin"]) {
      expect(within(routeNav).getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });
});
