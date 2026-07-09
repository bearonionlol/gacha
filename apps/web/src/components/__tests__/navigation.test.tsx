import { render, screen } from "@testing-library/react";
import { AppShell } from "../app-shell";

describe("app navigation", () => {
  it("exposes every core route", () => {
    render(
      <AppShell>
        <main>content</main>
      </AppShell>
    );

    for (const label of ["Command", "Vault", "Market", "Forge", "Redemption", "Admin"]) {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });
});
