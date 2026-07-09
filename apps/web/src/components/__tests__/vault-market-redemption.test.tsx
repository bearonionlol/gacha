import { render, screen } from "@testing-library/react";
import MarketPage from "../../app/market/page";
import RedemptionPage from "../../app/redemption/page";
import VaultPage from "../../app/vault/page";

describe("vault, market, and redemption routes", () => {
  it("renders resale inventory descriptors and brand disclaimers in the vault", () => {
    render(<VaultPage />);

    expect(screen.getByText(/Pokemon TCG Charizard ex/i)).toBeInTheDocument();
    expect(screen.getByText(/Authentic resale collectible descriptor/i)).toBeInTheDocument();
    expect(screen.getByText(/no affiliation or endorsement/i)).toBeInTheDocument();
  });

  it("renders marketplace fees and escrow disclosure", () => {
    render(<MarketPage />);

    expect(screen.getByText(/Fixed-price market/i)).toBeInTheDocument();
    expect(screen.getByText(/escrowed until sale or cancellation/i)).toBeInTheDocument();
    expect(screen.getByText(/protocol fee/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open listing for Pokemon TCG Charizard ex/i })).toBeDisabled();
    expect(screen.getAllByText(/Phase 4A guard/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Connect wallet before this action can send a testnet transaction/i).length).toBeGreaterThan(
      0
    );
  });

  it("renders redemption lifecycle states", () => {
    render(<RedemptionPage />);

    expect(screen.getByText(/Redemption Desk/i)).toBeInTheDocument();
    expect(screen.getByText(/requested/i)).toBeInTheDocument();
    expect(screen.getByText(/fulfilled/i)).toBeInTheDocument();
    expect(screen.getByText(/Opened on Jul 9/i)).toBeInTheDocument();
    expect(screen.getByText(/Approval target: RedemptionRegistry/i)).toBeInTheDocument();
    expect(screen.getByText(/Transaction submission lands in Phase 4B/i)).toBeInTheDocument();
  });

  it("renders item-specific disabled vault actions", () => {
    render(<VaultPage />);

    expect(screen.getByRole("button", { name: /Review vault item Pokemon TCG Charizard ex/i })).toBeDisabled();
  });
});
