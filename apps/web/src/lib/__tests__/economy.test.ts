import {
  buildProtocolEconomySnapshot,
  calculateBuybackSpread,
  calculateProtocolTake,
  projectDropMargin,
  validateSinkBudget
} from "../economy";
import { activeDrop, marketListings } from "../game-state";
import { vaultStats } from "../inventory";

describe("protocol economy controls", () => {
  it("rounds protocol fee math up to the nearest cent", () => {
    expect(calculateProtocolTake({ priceCents: 900, feeBps: 250 })).toEqual({
      feeBps: 250,
      priceCents: 900,
      protocolFeeCents: 23,
      sellerReceivesCents: 877
    });
  });

  it("projects drop margin without hiding inventory cost", () => {
    expect(
      projectDropMargin({
        estimatedInventoryCostCents: 520,
        packPriceCents: 900,
        reserveBps: 1_500,
        targetProtocolFeeBps: 250
      })
    ).toEqual({
      estimatedInventoryCostCents: 520,
      grossMarginCents: 380,
      packPriceCents: 900,
      protocolFeeCents: 23,
      reserveBps: 1_500,
      reserveCents: 135,
      targetProtocolFeeBps: 250
    });
  });

  it("keeps dust sink budgets bounded by balance and floor", () => {
    expect(validateSinkBudget({ craftFeeCents: 150, dustBalance: 18, dustFloor: 8, dustSpent: 5 })).toEqual({
      allowed: true,
      craftFeeCents: 150,
      dustRemaining: 13,
      reason: "within-sink-budget"
    });

    expect(validateSinkBudget({ craftFeeCents: 150, dustBalance: 18, dustFloor: 8, dustSpent: 12 })).toEqual({
      allowed: false,
      craftFeeCents: 150,
      dustRemaining: 6,
      reason: "dust-floor-breach"
    });
  });

  it("calculates buyback spread as explicit protocol cushion", () => {
    expect(calculateBuybackSpread({ buybackCents: 14_500, estimateCents: 18_000 })).toEqual({
      buybackCents: 14_500,
      estimateCents: 18_000,
      spreadBps: 1_944,
      spreadCents: 3_500
    });
  });

  it("builds an operator snapshot for transparent protocol revenue", () => {
    const snapshot = buildProtocolEconomySnapshot({ activeDrop, marketListings, vaultStats });

    expect(snapshot.packMargin.title).toBe("Drop margin");
    expect(snapshot.packMargin.protocolFeeCents).toBeGreaterThan(0);
    expect(snapshot.marketFees.title).toBe("Marketplace take");
    expect(snapshot.marketFees.blendedFeeBps).toBe(250);
    expect(snapshot.buybackSpread.title).toBe("Buyback spread");
    expect(snapshot.operatorReserve.title).toBe("Operator reserve");
  });
});
