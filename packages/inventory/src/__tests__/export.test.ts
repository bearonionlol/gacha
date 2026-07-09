import { describe, expect, it } from "vitest";

import { exportInventoryAsCsv, exportInventoryAsJson, inventoryCsvColumns } from "../export";
import { createPhotoHash } from "../photo-hash";
import type { InventoryItem } from "../schema";

const item: InventoryItem = {
  inventoryId: "inv-export-001",
  brand: "pokemon",
  category: "raw_card",
  cardName: "Pokemon TCG Pikachu, Yellow Cheeks",
  setName: "Base Set",
  cardNumber: "58/102",
  language: "English",
  edition: "Unlimited",
  variant: "Yellow Cheeks",
  rawConditionEstimate: "Near Mint",
  conditionNotes: "Clean front; tiny whitening on back.",
  gradingCompany: null,
  grade: null,
  certNumber: null,
  certUrl: null,
  photoUrls: ["front.jpg", "back.jpg"],
  photoHash: "sha256:35c41478a72e5ac3b89fcf2eaa7b52967978bd52c29996c3b9b514701a4d3fbc",
  vaultLocationLabel: "Vault A / Row 1",
  custodyStatus: "vaulted",
  redeemable: true,
  marketEstimateCents: 4500,
  buybackQuoteCents: 3000,
  grailTier: "minor",
  canonicalCollectibleKey: "pokemon:base-set:pikachu:58-102:yellow-cheeks",
  forgeTier: 1,
  tradeInEligible: true,
  tierPoolEligible: true,
  forgeSetKey: "pokemon:base-set",
  craftingTags: ["electric", "base_set"],
  dropEligibility: true,
  legalDisclaimer: "Authentic resale collectible descriptor only; no affiliation or endorsement is claimed.",
  createdAt: "2026-07-08T00:00:00.000Z",
  updatedAt: "2026-07-08T00:00:00.000Z"
};

describe("inventory exports", () => {
  it("exports validated inventory as pretty JSON", () => {
    const json = exportInventoryAsJson([item]);

    expect(JSON.parse(json)).toEqual([item]);
    expect(json).toContain("\n  {");
  });

  it("exports CSV with stable headers in InventoryItem field order", () => {
    const csv = exportInventoryAsCsv([item]);
    const [header, row] = csv.split("\n");

    expect(header).toBe(
      [
        "inventoryId",
        "brand",
        "category",
        "cardName",
        "setName",
        "cardNumber",
        "language",
        "edition",
        "variant",
        "rawConditionEstimate",
        "conditionNotes",
        "gradingCompany",
        "grade",
        "certNumber",
        "certUrl",
        "photoUrls",
        "photoHash",
        "vaultLocationLabel",
        "custodyStatus",
        "redeemable",
        "marketEstimateCents",
        "buybackQuoteCents",
        "grailTier",
        "canonicalCollectibleKey",
        "forgeTier",
        "tradeInEligible",
        "tierPoolEligible",
        "forgeSetKey",
        "craftingTags",
        "dropEligibility",
        "legalDisclaimer",
        "createdAt",
        "updatedAt"
      ].join(",")
    );
    expect(row).toContain('"Pokemon TCG Pikachu, Yellow Cheeks"');
    expect(row).toContain("pokemon:base-set:pikachu:58-102:yellow-cheeks,1,true,true,pokemon:base-set");
    expect(row).toContain('"[""front.jpg"",""back.jpg""]"');
    expect(row).toContain('"[""electric"",""base_set""]"');
  });

  it("exports null graded-only fields as blank CSV cells", () => {
    const photoUrls = ["front.jpg"];
    const csv = exportInventoryAsCsv([
      {
        ...item,
        cardName: "Pokemon TCG Pikachu",
        photoUrls,
        photoHash: createPhotoHash(photoUrls),
        craftingTags: ["electric"]
      }
    ]);
    const [, row] = csv.split("\n");
    const cells = row?.split(",");

    expect(cells?.[inventoryCsvColumns.indexOf("gradingCompany")]).toBe("");
    expect(cells?.[inventoryCsvColumns.indexOf("grade")]).toBe("");
    expect(cells?.[inventoryCsvColumns.indexOf("certNumber")]).toBe("");
    expect(cells?.[inventoryCsvColumns.indexOf("certUrl")]).toBe("");
  });

  it("escapes CSV fields containing quotes, commas, and newlines", () => {
    const csv = exportInventoryAsCsv([
      {
        ...item,
        cardName: 'Pokemon TCG Eevee "Winner", Promo',
        conditionNotes: "Front is clean.\nBack has a print line."
      }
    ]);

    expect(csv).toContain('"Pokemon TCG Eevee ""Winner"", Promo"');
    expect(csv).toContain('"Front is clean.\nBack has a print line."');
  });

  it("rejects invalid inventory before export", () => {
    expect(() => exportInventoryAsJson([{ ...item, marketEstimateCents: -1 }])).toThrow();
    expect(() => exportInventoryAsCsv([{ ...item, photoHash: "not-a-hash" }])).toThrow();
  });
});
