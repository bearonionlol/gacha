import { render, screen } from "@testing-library/react";
import HomePage from "../page";

describe("Phase 3 app smoke", () => {
  it("renders the command center as the first screen", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: /Drop Command/i })).toBeInTheDocument();
    expect(screen.getByText(/Robinhood Chain Testnet/i)).toBeInTheDocument();
  });
});
