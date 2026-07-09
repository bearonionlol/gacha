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
    expect(screen.getByText(/Album progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Master set/i)).toBeInTheDocument();
    expect(screen.getByText(/Next chase/i)).toBeInTheDocument();
    expect(screen.getByText(/Trade, forge, or buy/i)).toBeInTheDocument();
  });

  it("renders marketplace fees and escrow disclosure", () => {
    render(<MarketPage />);

    expect(screen.getByText(/Fixed-price market/i)).toBeInTheDocument();
    expect(screen.getByText(/vault-backed listings/i)).toBeInTheDocument();
    expect(screen.queryByText(/deterministic demo listings/i)).not.toBeInTheDocument();
    expect(screen.getByText(/escrowed until sale or cancellation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/protocol fee/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Seller receives/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Floor delta/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Buyback delta/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Listing health/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Open listing for Pokemon TCG Charizard ex/i })).toBeDisabled();
    expect(screen.getAllByText(/Approve Marketplace/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Marketplace\.list/i).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/Owned inventory token ID/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Scan wallet inventory/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/known seeded inventory/i).length).toBeGreaterThan(0);
  });

  it("renders redemption lifecycle states", () => {
    render(<RedemptionPage />);

    expect(screen.getByText(/Redemption Desk/i)).toBeInTheDocument();
    expect(screen.getByText(/requested/i)).toBeInTheDocument();
    expect(screen.getByText(/fulfilled/i)).toBeInTheDocument();
    expect(screen.getByText(/Opened on Jul 9/i)).toBeInTheDocument();
    expect(screen.getByText(/Approve RedemptionRegistry/i)).toBeInTheDocument();
    expect(screen.getAllByText(/RedemptionRegistry\.requestRedemption/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Redeemable inventory token ID/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Scan wallet inventory/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/known seeded inventory/i).length).toBeGreaterThan(0);
  });

  it("renders item-specific disabled vault actions", () => {
    render(<VaultPage />);

    expect(screen.getByRole("button", { name: /Review vault item Pokemon TCG Charizard ex/i })).toBeDisabled();
  });
});
