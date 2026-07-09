import { render, screen } from "@testing-library/react";
import HomePage from "../../app/page";

describe("dashboard", () => {
  it("shows odds, randomness disclosure, and reveal next actions", () => {
    render(<HomePage />);

    expect(screen.getByText(/Physical grail/i)).toBeInTheDocument();
    expect(screen.getByText(/operator-controlled testnet randomness/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Keep in vault/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /List on market/i })).toBeInTheDocument();
  });

  it("shows Signal Run without promising better odds", () => {
    render(<HomePage />);

    expect(screen.getByText(/Signal Run/i)).toBeInTheDocument();
    expect(screen.getByText(/does not change pull odds/i)).toBeInTheDocument();
  });
});
