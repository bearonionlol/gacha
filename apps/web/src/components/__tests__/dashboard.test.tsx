import { render, screen } from "@testing-library/react";
import HomePage from "../../app/page";
import { StatusRail } from "../status-rail";

describe("dashboard", () => {
  const originalRegistry = process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY;

  afterEach(() => {
    if (originalRegistry === undefined) {
      delete process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY;
    } else {
      process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY = originalRegistry;
    }
  });

  it("shows guaranteed contents, randomness disclosure, and reveal next actions", async () => {
    render(await HomePage());

    expect(screen.getAllByText(/Vaulted physical card/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Fire shards/i)).toBeInTheDocument();
    expect(screen.getByText(/randomness adapter is operator-controlled/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Keep in vault/i })).toHaveAttribute("href", "/vault");
    expect(screen.getByRole("link", { name: /List on market/i })).toHaveAttribute("href", "/market");
  });

  it("shows Signal Run without promising better odds", async () => {
    render(await HomePage());

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

    render(<StatusRail />);

    expect(screen.getByText(/robinhoodTestnet deployment registry loaded/i)).toBeInTheDocument();
    expect(screen.getByText("testnet")).toBeInTheDocument();
    expect(screen.getByText("46630")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("shows the live protocol panel without blocking demo browsing", async () => {
    render(await HomePage());

    expect(screen.getByRole("heading", { name: /Live protocol offline/i })).toBeInTheDocument();
  });

  it("shows testnet write panels on dashboard actions without roadmap labels", async () => {
    render(await HomePage());

    expect(screen.getByText(/Reserve pack on testnet/i)).toBeInTheDocument();
    expect(screen.getAllByText(/PackSale\.purchase/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0\.01 ETH/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Wallet action/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Phase 4B/i)).not.toBeInTheDocument();
  });

  it("shows Phase 4C pack reveal operations on the dashboard", async () => {
    render(await HomePage());

    expect(screen.getByText(/Reveal purchase on testnet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Purchase ID/i)).toBeInTheDocument();
    expect(screen.getAllByText(/PackSale\.reveal/i).length).toBeGreaterThan(0);
  });

  it("shows transparent protocol economy controls", async () => {
    render(await HomePage());

    expect(screen.getByRole("heading", { name: /Protocol economy/i })).toBeInTheDocument();
    expect(screen.getByText(/Drop margin/i)).toBeInTheDocument();
    expect(screen.getByText(/Marketplace take/i)).toBeInTheDocument();
    expect(screen.getByText(/Buyback spread/i)).toBeInTheDocument();
    expect(screen.getByText(/Operator reserve/i)).toBeInTheDocument();
    expect(screen.getByText(/Fee math is shown before wallet confirmation/i)).toBeInTheDocument();
  });

  it("shows indexed protocol activity with next actions and explorer links", async () => {
    render(await HomePage());

    expect(screen.getByText(/Forge craft submitted/i)).toBeInTheDocument();
    expect(screen.getByText(/Inspect crafted output/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View tx/i })).toHaveAttribute(
      "href",
      expect.stringContaining("explorer.testnet.chain.robinhood.com/tx/")
    );
  });
});
