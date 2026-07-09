import {
  calculateSellerProceeds,
  enrichMarketListings,
  flagListingRisk,
  sortListings,
  type MarketplaceListingInput
} from "../marketplace";
import { marketListings } from "../game-state";

const sampleListings: MarketplaceListingInput[] = [
  {
    askCents: 10_000,
    buybackCents: 8_500,
    cardId: "card-floor",
    feeBps: 250,
    id: "listing-floor",
    seller: "Vault Operator",
    title: "Floor listing"
  },
  {
    askCents: 9_200,
    buybackCents: 8_500,
    cardId: "card-under-floor",
    feeBps: 250,
    id: "listing-under-floor",
    seller: "Collector",
    title: "Under floor"
  },
  {
    askCents: 18_000,
    buybackCents: 8_500,
    cardId: "card-rich",
    feeBps: 250,
    id: "listing-rich",
    seller: "Collector",
    title: "Rich ask"
  }
];

describe("marketplace intelligence", () => {
  it("calculates seller proceeds with protocol fee rounded up", () => {
    expect(calculateSellerProceeds({ askCents: 12_500, feeBps: 250 })).toEqual({
      askCents: 12_500,
      feeBps: 250,
      protocolFeeCents: 313,
      sellerReceivesCents: 12_187
    });
  });

  it("sorts best-value listings by floor discount", () => {
    expect(sortListings(sampleListings, "best-value")[0]?.id).toBe("listing-under-floor");
  });

  it("flags listings that are far above floor", () => {
    expect(flagListingRisk({ askCents: 50_000, floorCents: 12_000 })).toEqual({
      message: "Well above floor",
      severity: "high"
    });
  });

  it("enriches listings with floor, buyback, proceeds, and risk", () => {
    const enrichedListings = enrichMarketListings(marketListings);

    expect(enrichedListings[0]?.sellerReceivesCents).toBeGreaterThan(0);
    expect(enrichedListings[0]?.floorDeltaCents).toBeDefined();
    expect(enrichedListings[0]?.buybackDeltaCents).toBeDefined();
    expect(enrichedListings[0]?.risk.message).toMatch(/floor|value/i);
  });
});
