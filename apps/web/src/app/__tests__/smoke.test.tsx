import { render, screen } from "@testing-library/react";
import HomePage from "../page";

describe("Gacha app smoke", () => {
  it("renders the interactive gacha as the first screen", async () => {
    render(await HomePage());

    expect(screen.getByRole("heading", { name: /Vault Gacha/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Robinhood Chain Testnet/i })).toBeInTheDocument();
  });
});
