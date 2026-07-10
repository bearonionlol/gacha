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
    expect(screen.getAllByText(/Forge Tier/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Use as trade-in/i })).toHaveAttribute("href", "/forge");
  });

  it("renders marketplace fees and escrow disclosure", () => {
    render(<MarketPage />);

    expect(screen.getByText(/Vault Market/i)).toBeInTheDocument();
    expect(screen.getByText(/Compare vault-backed listings/i)).toBeInTheDocument();
    expect(screen.queryByText(/deterministic demo listings/i)).not.toBeInTheDocument();
    expect(screen.getByText(/escrowed until sale or cancellation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/protocol fee/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Seller receives/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Floor delta/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Buyback delta/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Listing health/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Duplicate trade-in eligible/i)).toBeInTheDocument();
    expect(screen.getByText(/Market order ticket/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Approve Marketplace/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Marketplace\.list/i).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/Owned inventory token ID/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Scan wallet inventory/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/known seeded inventory/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/On-chain listing ID/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Marketplace\.buy/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Marketplace\.cancel/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Marketplace\.withdrawProceeds/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Buyback desk/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Review in Vault Ascension/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/BuybackVault\.acceptQuote/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/BuybackVault\.withdrawPayout/i).length).toBeGreaterThan(0);
  });

  it("renders redemption lifecycle states", () => {
    render(<RedemptionPage />);

    expect(screen.getByText(/Redemption Desk/i)).toBeInTheDocument();
    expect(screen.getAllByText(/requested/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/completed/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Vault Ascension boundary/i)).toBeInTheDocument();
    expect(screen.getByText(/Opened on Jul 9/i)).toBeInTheDocument();
    expect(screen.getByText(/Approve RedemptionRegistry/i)).toBeInTheDocument();
    expect(screen.getAllByText(/RedemptionRegistry\.requestRedemption/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Redeemable inventory token ID/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Scan wallet inventory/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/known seeded inventory/i).length).toBeGreaterThan(0);
  });

  it("routes item-specific vault actions into Forge and redemption", () => {
    render(<VaultPage />);

    expect(screen.getByRole("link", { name: /Use as trade-in/i })).toHaveAttribute("href", "/forge");
    expect(screen.getAllByRole("link", { name: /Redeem options/i }).length).toBeGreaterThan(0);
  });
});
