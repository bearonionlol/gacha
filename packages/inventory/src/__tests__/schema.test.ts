import { describe, expect, it } from "vitest";

import { createPhotoHash } from "../photo-hash";
import { sampleInventory } from "../sample-inventory";
import { InventoryItemSchema, InventoryItemsSchema, type InventoryItem } from "../schema";

const validPhotoUrls = ["https://assets.example.com/inventory/inv-test-001-front.jpg"];

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
  gradingCompany: null,
  grade: null,
  certNumber: null,
  certUrl: null,
  photoUrls: validPhotoUrls,
  photoHash: createPhotoHash(validPhotoUrls),
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

const gradedItem: InventoryItem = {
  ...validItem,
  category: "graded_card",
  gradingCompany: "PSA",
  grade: "10",
  certNumber: "SAMPLE-CERT-123",
  certUrl: "https://certs.example.com/SAMPLE-CERT-123"
};

describe("InventoryItemSchema", () => {
  it("validates a complete inventory item with the shared domain fields", () => {
    expect(InventoryItemSchema.parse(validItem)).toEqual(validItem);
  });

  it("accepts null graded-only fields for raw cards", () => {
    const parsed = InventoryItemSchema.parse(validItem);

    expect(parsed.gradingCompany).toBeNull();
    expect(parsed.grade).toBeNull();
    expect(parsed.certNumber).toBeNull();
    expect(parsed.certUrl).toBeNull();
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

  it("rejects photo hashes that do not match the photo URLs", () => {
    expect(() =>
      InventoryItemSchema.parse({
        ...validItem,
        photoHash: createPhotoHash(["https://assets.example.com/inventory/different-front.jpg"])
      })
    ).toThrow();
  });

  it("requires non-empty graded-only fields for graded cards and slabs", () => {
    for (const category of ["graded_card", "slab"] as const) {
      expect(() => InventoryItemSchema.parse({ ...gradedItem, category, gradingCompany: null })).toThrow();
      expect(() => InventoryItemSchema.parse({ ...gradedItem, category, grade: "" })).toThrow();
      expect(() => InventoryItemSchema.parse({ ...gradedItem, category, certNumber: null })).toThrow();
      expect(() => InventoryItemSchema.parse({ ...gradedItem, category, certUrl: null })).toThrow();
    }
  });

  it("validates sample inventory with Pokemon, One Piece, and graded starter items", () => {
    const parsed = InventoryItemsSchema.parse(sampleInventory);

    expect(parsed.some((item) => item.brand === "pokemon" && item.category === "raw_card")).toBe(true);
    expect(parsed.some((item) => item.brand === "one_piece" && item.category === "raw_card")).toBe(true);
    expect(
      parsed.some(
        (item) =>
          item.category === "graded_card" &&
          typeof item.gradingCompany === "string" &&
          item.gradingCompany.length > 0
      )
    ).toBe(true);
    expect(parsed.every((item) => item.legalDisclaimer.toLowerCase().includes("no affiliation"))).toBe(true);
  });

  it("rejects duplicate inventory IDs in inventory lists", () => {
    const secondPhotoUrls = ["https://assets.example.com/inventory/inv-test-002-front.jpg"];
    const duplicateIdItem: InventoryItem = {
      ...validItem,
      cardName: "Pokemon TCG Bulbasaur",
      photoUrls: secondPhotoUrls,
      photoHash: createPhotoHash(secondPhotoUrls)
    };

    expect(() => InventoryItemsSchema.parse([validItem, duplicateIdItem])).toThrow(/duplicate inventoryId/i);
  });
});
