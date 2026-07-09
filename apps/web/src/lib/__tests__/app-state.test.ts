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
      deployedAt: "2026-07-09T00:00:00.000Z",
      contracts: {
        ItemToken: "0x0000000000000000000000000000000000000001",
        Marketplace: "0x0000000000000000000000000000000000000002"
      }
    });

    expect(status.mode).toBe("testnet");
    expect(status.contracts).toHaveLength(2);
  });

  it("keeps Signal Run separate from pull odds", () => {
    expect(signalRun.disclosure).toMatch(/does not change pull odds/i);
    expect(signalRun.recipeProgressPercent).toBeGreaterThan(0);
  });

  it("creates market listings from inventory-backed cards", () => {
    expect(marketListings[0]?.seller).toMatch(/vault/i);
    expect(activeDrop.odds.some((row) => row.label === "Physical grail")).toBe(true);
  });
});
