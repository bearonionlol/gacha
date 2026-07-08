import { describe, expect, it } from "vitest";

import { sampleInventory } from "../sample-inventory";
import { InventoryItemSchema, InventoryItemsSchema, type InventoryItem } from "../schema";

const validItem: InventoryItem = {
  inventoryId: "inv-test-001",
  brand: "pokemon",
  category: "raw_card",
  cardName: "Pokemon TCG Pikachu, Yellow Cheeks",
  setName: "Base Set",
  cardNumber: "58/102",
  language: "English",
  edition: "Unlimited",
  variant: "Yellow Cheeks",
  rawConditionEstimate: "Near Mint",
  conditionNotes: "Light edge wear visible in front photo.",
  gradingCompany: "",
  grade: "",
  certNumber: "",
  certUrl: "",
  photoUrls: ["https://assets.example.com/inventory/inv-test-001-front.jpg"],
  photoHash: "sha256:1b0ab7c853927324a4c95e250dd802be4d3c84b9f5f77c62160428ad4cc548ca",
  vaultLocationLabel: "Vault A / Row 1 / Bin 3",
  custodyStatus: "verified",
  redeemable: true,
  marketEstimateCents: 4500,
  buybackQuoteCents: 3000,
  grailTier: "minor",
  craftingTags: ["electric", "base_set"],
  dropEligibility: true,
  legalDisclaimer: "Authentic resale collectible descriptor only; no affiliation or endorsement is claimed.",
  createdAt: "2026-07-08T00:00:00.000Z",
  updatedAt: "2026-07-08T00:00:00.000Z"
};

describe("InventoryItemSchema", () => {
  it("validates a complete inventory item with the shared domain fields", () => {
    expect(InventoryItemSchema.parse(validItem)).toEqual(validItem);
  });

  it("rejects unsupported brands, categories, statuses, and grail tiers", () => {
    expect(() => InventoryItemSchema.parse({ ...validItem, brand: "digimon" })).toThrow();
    expect(() => InventoryItemSchema.parse({ ...validItem, category: "booster_pack" })).toThrow();
    expect(() => InventoryItemSchema.parse({ ...validItem, custodyStatus: "archived" })).toThrow();
    expect(() => InventoryItemSchema.parse({ ...validItem, grailTier: "mythic" })).toThrow();
  });

  it("rejects malformed hashes, negative cents, and non-ISO dates", () => {
    expect(() => InventoryItemSchema.parse({ ...validItem, photoHash: "abc123" })).toThrow();
    expect(() => InventoryItemSchema.parse({ ...validItem, marketEstimateCents: -1 })).toThrow();
    expect(() => InventoryItemSchema.parse({ ...validItem, buybackQuoteCents: 1.5 })).toThrow();
    expect(() => InventoryItemSchema.parse({ ...validItem, updatedAt: "07/08/2026" })).toThrow();
  });

  it("validates sample inventory with Pokemon, One Piece, and graded starter items", () => {
    const parsed = InventoryItemsSchema.parse(sampleInventory);

    expect(parsed.some((item) => item.brand === "pokemon" && item.category === "raw_card")).toBe(true);
    expect(parsed.some((item) => item.brand === "one_piece" && item.category === "raw_card")).toBe(true);
    expect(parsed.some((item) => item.category === "graded_card" && item.gradingCompany.length > 0)).toBe(true);
    expect(parsed.every((item) => item.legalDisclaimer.toLowerCase().includes("no affiliation"))).toBe(true);
  });
});
