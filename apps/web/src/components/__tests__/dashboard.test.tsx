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
    expect(screen.getAllByText("Magic Dust").length).toBeGreaterThan(0);
    expect(screen.getByText(/50% Echo, 35% Prism, and 15% Star/i)).toBeInTheDocument();
    expect(screen.getByText(/Illustrative demo pull/i)).toBeInTheDocument();
    expect(screen.getByText(/Demo interactions do not submit transactions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Keep in vault/i })).toHaveAttribute("href", "/vault");
    expect(screen.getByRole("link", { name: /List on market/i })).toHaveAttribute("href", "/market");
  });

  it("shows Signal Run without promising better odds", async () => {
    render(await HomePage());

    expect(screen.getByText(/Signal Run/i)).toBeInTheDocument();
    expect(screen.getByText(/does not change pull odds/i)).toBeInTheDocument();
    expect(screen.getByText(/Ascension prep/i)).toBeInTheDocument();
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
        RedemptionRegistry: "0x36C37cb08c78E50a87BB705D6F06EBae11C07451",
        DustLedger: "0x0000000000000000000000000000000000000009",
        DustRewardPolicy: "0x000000000000000000000000000000000000000a",
        CollectibleForgePolicy: "0x000000000000000000000000000000000000000b",
        TradeInVault: "0x000000000000000000000000000000000000000c",
        TierPool: "0x000000000000000000000000000000000000000d",
        VaultPassport: "0x000000000000000000000000000000000000000e",
        VaultForge: "0x000000000000000000000000000000000000000f"
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

    expect(screen.getByRole("heading", { name: /Demo protocol preview/i })).toBeInTheDocument();
  });

  it("shows environment-aware transaction previews without roadmap labels", async () => {
    render(await HomePage());

    expect(screen.getAllByText(/Reserve capsule/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PackSale\.purchase/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0\.01 ETH/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Preview only/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Phase 4B/i)).not.toBeInTheDocument();
  });

  it("pauses new paid pulls when Vault Forge V4 is not deployed", async () => {
    process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY = JSON.stringify({
      network: "robinhoodTestnet",
      chainId: 46630,
      contracts: {
        InventoryRegistry: "0x0000000000000000000000000000000000000001",
        ItemToken: "0x0000000000000000000000000000000000000002",
        CommitRevealRandomnessProvider: "0x0000000000000000000000000000000000000003",
        PackSale: "0x0000000000000000000000000000000000000004",
        Marketplace: "0x0000000000000000000000000000000000000005",
        BuybackVault: "0x0000000000000000000000000000000000000006",
        Forge: "0x0000000000000000000000000000000000000007",
        RedemptionRegistry: "0x0000000000000000000000000000000000000008"
      }
    });

    render(await HomePage());

    expect(screen.getByText(/New pulls are paused until PackSale and Vault Forge V4 are deployed together/i)).toBeInTheDocument();
    expect(screen.getByText(/Existing purchases can still be revealed/i)).toBeInTheDocument();
    expect(screen.getByText(/Reveal reserved capsule/i)).toBeInTheDocument();
  });

  it("shows Phase 4C pack reveal operations on the dashboard", async () => {
    render(await HomePage());

    expect(screen.getByText(/Reveal reserved capsule/i)).toBeInTheDocument();
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
