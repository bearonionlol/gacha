import { signalRun } from "../arcade";
import { resolveDeploymentStatus } from "../deployments";
import { activeDrop, marketListings } from "../game-state";
import { collectibleCards, vaultStats } from "../inventory";

describe("Phase 3 app state", () => {
  it("maps sample inventory into collectible cards and vault stats", () => {
    expect(collectibleCards.map((card) => card.title)).toContain("Pokemon TCG Charizard ex");
    expect(vaultStats.totalItems).toBeGreaterThanOrEqual(3);
    expect(vaultStats.marketValueCents).toBeGreaterThan(0);
  });

  it("uses demo deployment status when no registry is present", () => {
    const status = resolveDeploymentStatus(null);

    expect(status.mode).toBe("demo");
    expect(status.chainName).toBe("Robinhood Chain Testnet");
    expect(status.message).toMatch(/demo mode/i);
  });

  it("parses a valid deployment registry snapshot", () => {
    const status = resolveDeploymentStatus({
      network: "robinhoodTestnet",
      chainId: 46630,
      timestamp: "2026-07-09T00:00:00.000Z",
      contracts: {
        InventoryRegistry: "0x0000000000000000000000000000000000000001",
        ItemToken: "0x0000000000000000000000000000000000000002",
        CommitRevealRandomnessProvider: "0x0000000000000000000000000000000000000003",
        PackSale: "0x0000000000000000000000000000000000000004",
        Marketplace: "0x0000000000000000000000000000000000000005",
        BuybackVault: "0x0000000000000000000000000000000000000006",
        Forge: "0x0000000000000000000000000000000000000007",
        RedemptionRegistry: "0x0000000000000000000000000000000000000008",
        DustLedger: "0x0000000000000000000000000000000000000009",
        DustRewardPolicy: "0x000000000000000000000000000000000000000a",
        CollectibleForgePolicy: "0x000000000000000000000000000000000000000b",
        TradeInVault: "0x000000000000000000000000000000000000000c",
        TierPool: "0x000000000000000000000000000000000000000d",
        VaultPassport: "0x000000000000000000000000000000000000000e",
        VaultForge: "0x000000000000000000000000000000000000000f"
      }
    });

    expect(status.mode).toBe("testnet");
    expect(status.readiness).toBe("ready");
    expect(status.contracts).toHaveLength(15);
    expect(status.message).toContain("2026-07-09T00:00:00.000Z");
  });

  it("downgrades supported-chain registries when required contracts are missing", () => {
    const status = resolveDeploymentStatus({
      network: "robinhoodTestnet",
      chainId: 46630,
      contracts: {
        ItemToken: "0x0000000000000000000000000000000000000001",
        Marketplace: "0x0000000000000000000000000000000000000002"
      }
    });

    expect(status.mode).toBe("testnet");
    expect(status.readiness).toBe("incomplete");
    expect(status.message).toMatch(/missing required contracts/i);
  });

  it("downgrades supported-chain registries when contract addresses are malformed", () => {
    const status = resolveDeploymentStatus({
      network: "robinhoodTestnet",
      chainId: 46630,
      contracts: {
        InventoryRegistry: "0x0000000000000000000000000000000000000001",
        ItemToken: "not-an-address",
        CommitRevealRandomnessProvider: "0x0000000000000000000000000000000000000003",
        PackSale: "0x0000000000000000000000000000000000000004",
        Marketplace: "0x0000000000000000000000000000000000000005",
        BuybackVault: "0x0000000000000000000000000000000000000006",
        Forge: "0x0000000000000000000000000000000000000007",
        RedemptionRegistry: "0x0000000000000000000000000000000000000008",
        DustLedger: "0x0000000000000000000000000000000000000009",
        DustRewardPolicy: "0x000000000000000000000000000000000000000a",
        CollectibleForgePolicy: "0x000000000000000000000000000000000000000b",
        TradeInVault: "0x000000000000000000000000000000000000000c",
        TierPool: "0x000000000000000000000000000000000000000d",
        VaultPassport: "0x000000000000000000000000000000000000000e",
        VaultForge: "0x000000000000000000000000000000000000000f"
      }
    });

    expect(status.mode).toBe("testnet");
    expect(status.readiness).toBe("incomplete");
    expect(status.message).toMatch(/invalid contract addresses/i);
  });

  it("does not coerce unsupported deployment chain IDs to Robinhood testnet", () => {
    const status = resolveDeploymentStatus({
      network: "localhost",
      chainId: 31337,
      contracts: {
        ItemToken: "0x0000000000000000000000000000000000000001"
      }
    });

    expect(status.mode).toBe("demo");
    expect(status.chainName).toBe("Unsupported chain");
    expect(status.chainId).toBe(31337);
    expect(status.message).toMatch(/unsupported chain/i);
  });

  it("keeps Signal Run separate from pull odds", () => {
    expect(signalRun.disclosure).toMatch(/does not change pull odds/i);
    expect(signalRun.recipeProgressPercent).toBeGreaterThan(0);
  });

  it("creates market listings from inventory-backed cards", () => {
    expect(marketListings[0]?.seller).toMatch(/vault/i);
    expect(activeDrop.guarantees.some((row) => row.label === "Vaulted physical card")).toBe(true);
    expect(activeDrop.guarantees.some((row) => row.label === "Fire shards" && row.amount === "3")).toBe(true);
  });
});
