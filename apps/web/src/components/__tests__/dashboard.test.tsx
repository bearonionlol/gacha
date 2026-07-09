import { render, screen } from "@testing-library/react";
import HomePage from "../../app/page";

describe("dashboard", () => {
  const originalRegistry = process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY;

  afterEach(() => {
    if (originalRegistry === undefined) {
      delete process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY;
    } else {
      process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY = originalRegistry;
    }
  });

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

  it("shows deployed registry readiness when a testnet registry is provided", () => {
    process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY = JSON.stringify({
      network: "robinhoodTestnet",
      chainId: 46630,
      timestamp: "2026-07-09T15:03:54.201Z",
      contracts: {
        InventoryRegistry: "0x32657A9d0AFe229E132dA8610a23D6d32d22C4Ee",
        ItemToken: "0x78Cb0aE303a90719F41383E2040D06BBedB2d26d",
        CommitRevealRandomnessProvider: "0xBcD78FfB562cFAeae978Ba38496f042Da6eeB113",
        PackSale: "0x363074770a98a3f8c258148678aFd095c4E5C0Ba",
        Marketplace: "0x2d4Cfd663DDAef48ae4659c09068E842FC31423C",
        BuybackVault: "0x78d0d7C799A6D44085cb4372F1FF6BA49eD224b0",
        Forge: "0x26F77058552b9E69e7d1EE6AADeFeD4BbF555B4B",
        RedemptionRegistry: "0x36C37cb08c78E50a87BB705D6F06EBae11C07451"
      }
    });

    render(<HomePage />);

    expect(screen.getByText(/robinhoodTestnet deployment registry loaded/i)).toBeInTheDocument();
    expect(screen.getByText("testnet")).toBeInTheDocument();
    expect(screen.getByText("46630")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });
});
