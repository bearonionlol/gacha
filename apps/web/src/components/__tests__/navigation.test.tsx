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

    for (const label of ["Gacha", "Vault", "Market", "Forge", "Redeem", "Admin"]) {
      expect(within(routeNav).getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }

    expect(within(routeNav).getByRole("link", { name: /Gacha/i })).toHaveAttribute("aria-current", "page");
  });

  it("frames the app like a premium vault market", () => {
    render(
      <AppShell>
        <main>content</main>
      </AppShell>
    );

    expect(screen.getByRole("link", { name: /Gacha Markets home/i })).toBeInTheDocument();
    expect(screen.getByText("Gacha Markets")).toBeInTheDocument();
    expect(screen.getByText("Vault Arcade")).toBeInTheDocument();
    expect(screen.getByText(/Robinhood Chain testnet build/i)).toBeInTheDocument();
    expect(screen.getByText(/resale descriptors/i)).toBeInTheDocument();
  });
});
