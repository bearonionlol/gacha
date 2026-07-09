import { buildForgeImprint, evaluateForgePattern, getForgeRevenueProjection, placeForgeMaterial } from "../forge-model";

const pattern = ["fire", null, "seal", null, "dust", null, null, null, null] as const;

describe("Forge model", () => {
  it("matches exact 3 x 3 blueprint positions and reports misplaced materials", () => {
    expect(evaluateForgePattern(pattern, ["fire", null, "seal", null, "dust", null, null, null, null])).toEqual({
      complete: true,
      matchedSlots: 3,
      requiredSlots: 3,
      misplacedSlots: 0
    });

    expect(evaluateForgePattern(pattern, ["fire", "dust", "seal", null, null, null, null, null, null])).toEqual({
      complete: false,
      matchedSlots: 2,
      requiredSlots: 3,
      misplacedSlots: 1
    });
  });

  it("places repeated materials only into matching open slots and never exceeds lab balance", () => {
    const recyclerPattern = [null, null, null, "fire", "fire", null, null, null, null] as const;
    const first = placeForgeMaterial({
      balance: 2,
      materialId: "fire",
      pattern: recyclerPattern,
      slots: Array(9).fill(null)
    });
    const second = placeForgeMaterial({ balance: 2, materialId: "fire", pattern: recyclerPattern, slots: first.slots });
    const blocked = placeForgeMaterial({ balance: 2, materialId: "fire", pattern: recyclerPattern, slots: second.slots });

    expect(first.placedAt).toBe(3);
    expect(second.placedAt).toBe(4);
    expect(blocked).toEqual({ slots: second.slots, placedAt: null, reason: "balance-exhausted" });
  });

  it("creates stable provenance imprints that change with creative choices", () => {
    const base = {
      recipeId: 2n,
      frame: "signal" as const,
      inscription: "FIRST LIGHT",
      slots: [...pattern]
    };
    const first = buildForgeImprint(base);

    expect(first).toMatch(/^0x[0-9a-f]{64}$/);
    expect(buildForgeImprint(base)).toBe(first);
    expect(buildForgeImprint({ ...base, frame: "prism" })).not.toBe(first);
    expect(buildForgeImprint({ ...base, inscription: "SECOND LIGHT" })).not.toBe(first);
  });

  it("projects transparent remaining protocol fees without treating free recycling as revenue", () => {
    expect(getForgeRevenueProjection({ feeWei: 1_000n, maxTotalCrafts: 100, totalCrafts: 35 })).toEqual({
      remainingCrafts: 65,
      remainingFeeWei: 65_000n
    });
    expect(getForgeRevenueProjection({ feeWei: 0n, maxTotalCrafts: 1_000, totalCrafts: 20 }).remainingFeeWei).toBe(0n);
  });
});
