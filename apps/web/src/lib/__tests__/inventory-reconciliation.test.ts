import { browserSeededInventory } from "../browser-seeded-inventory";
import { reconcileInventory } from "../inventory-reconciliation";

describe("inventory reconciliation", () => {
  it("reports reviewed browser inventory and preserves the OP-06 photo exception warning", () => {
    const result = reconcileInventory(browserSeededInventory);

    expect(result.summary).toBe("needs_review");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "empty-tier-pool:1", severity: "warning" }),
        expect.objectContaining({ id: "photo-coverage:inv-op06-case-001", severity: "warning" })
      ])
    );
    expect(result.counts).toMatchObject({
      total: 4,
      dropEligible: 4,
      tierPoolEligible: 3,
      protectedGrails: 2
    });
    expect(result.tierPoolByTier).toMatchObject({ 2: 1, 3: 1, 4: 1 });
  });

  it("blocks duplicate physical identifiers and custody evidence", () => {
    const duplicate = {
      ...browserSeededInventory[0]!,
      canonicalCollectibleKey: "pokemon:duplicate-copy",
      cardName: "Second physical copy"
    };
    const result = reconcileInventory([...browserSeededInventory, duplicate]);

    expect(result.summary).toBe("blocked");
    expect(result.issues.map((issue) => issue.label)).toEqual(
      expect.arrayContaining(["Duplicate inventory ID", "Duplicate photo hash"])
    );
  });

  it("blocks exploitable valuation, custody, and grail policy states", () => {
    const unsafe = {
      ...browserSeededInventory[2]!,
      buybackQuoteCents: 40000,
      custodyStatus: "draft" as const,
      tradeInEligible: true
    };
    const result = reconcileInventory([unsafe]);

    expect(result.summary).toBe("blocked");
    expect(result.issues.map((issue) => issue.label)).toEqual(
      expect.arrayContaining([
        "Buyback exceeds market estimate",
        "Drop item is not custody ready",
        "Tier-pool item is not custody ready",
        "Grail trade-in is enabled"
      ])
    );
  });

  it("requires review when an ascension output tier has no reserve", () => {
    const result = reconcileInventory(browserSeededInventory.filter((item) => item.forgeTier !== 3));

    expect(result.summary).toBe("needs_review");
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "empty-tier-pool:3", severity: "warning" })])
    );
  });
});
