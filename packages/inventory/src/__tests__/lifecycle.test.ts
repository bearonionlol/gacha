import { describe, expect, it } from "vitest";

import {
  assertInventoryTransition,
  canAssignToDrop,
  canCraftItem,
  canListItem,
  canRecycleBuybackHeldItem,
  canRedeemItem,
  canTokenizeThroughPackDrop,
  canTransitionStatus,
  canVaultItem,
  getAllowedNextStatuses,
  transitionInventoryItem
} from "../lifecycle";
import type { InventoryItem, InventoryStatus } from "../schema";

const makeItem = (custodyStatus: InventoryStatus): InventoryItem => ({
  inventoryId: `inv-${custodyStatus}`,
  brand: "pokemon",
  category: "raw_card",
  cardName: "Pokemon TCG Charmander",
  setName: "Obsidian Flames",
  cardNumber: "26/197",
  language: "English",
  edition: "Modern",
  variant: "Standard",
  rawConditionEstimate: "Near Mint",
  conditionNotes: "Clean raw card.",
  gradingCompany: "",
  grade: "",
  certNumber: "",
  certUrl: "",
  photoUrls: ["https://assets.example.com/inventory/test-front.jpg"],
  photoHash: "sha256:1b0ab7c853927324a4c95e250dd802be4d3c84b9f5f77c62160428ad4cc548ca",
  vaultLocationLabel: "Vault A",
  custodyStatus,
  redeemable: true,
  marketEstimateCents: 1200,
  buybackQuoteCents: 800,
  grailTier: "none",
  craftingTags: ["fire"],
  dropEligibility: true,
  legalDisclaimer: "Authentic resale collectible descriptor only; no affiliation or endorsement is claimed.",
  createdAt: "2026-07-08T00:00:00.000Z",
  updatedAt: "2026-07-08T00:00:00.000Z"
});

describe("inventory lifecycle", () => {
  it("allows exactly the approved custody status transitions", () => {
    const allowedTransitions: Array<[InventoryStatus, InventoryStatus]> = [
      ["draft", "photographed"],
      ["photographed", "verified"],
      ["verified", "vaulted"],
      ["vaulted", "drop_ready"],
      ["drop_ready", "tokenized"],
      ["tokenized", "user_owned"],
      ["user_owned", "listed"],
      ["listed", "user_owned"],
      ["user_owned", "buyback_held"],
      ["buyback_held", "drop_ready"],
      ["user_owned", "redemption_pending"],
      ["redemption_pending", "redeemed"],
      ["redemption_pending", "user_owned"]
    ];

    for (const [from, to] of allowedTransitions) {
      expect(canTransitionStatus(from, to), `${from} -> ${to}`).toBe(true);
    }

    expect(canTransitionStatus("draft", "vaulted")).toBe(false);
    expect(canTransitionStatus("listed", "redeemed")).toBe(false);
    expect(getAllowedNextStatuses("redeemed")).toEqual([]);
    expect(() => assertInventoryTransition("draft", "vaulted")).toThrow(
      /Invalid inventory lifecycle transition: draft -> vaulted/
    );
  });

  it("updates custody status and timestamp when transitioning an item", () => {
    const updatedAt = "2026-07-08T01:00:00.000Z";
    const vaulted = transitionInventoryItem(makeItem("verified"), "vaulted", updatedAt);

    expect(vaulted.custodyStatus).toBe("vaulted");
    expect(vaulted.updatedAt).toBe(updatedAt);
  });

  it("enforces drop assignment, vaulting, and pack tokenization rules", () => {
    expect(canAssignToDrop(makeItem("vaulted"))).toBe(true);
    expect(canAssignToDrop(makeItem("drop_ready"))).toBe(true);
    expect(canAssignToDrop(makeItem("verified"))).toBe(false);
    expect(canAssignToDrop(makeItem("redeemed"))).toBe(false);

    expect(canVaultItem(makeItem("verified"))).toBe(true);
    expect(canVaultItem(makeItem("photographed"))).toBe(false);

    expect(canTokenizeThroughPackDrop(makeItem("drop_ready"))).toBe(true);
    expect(canTokenizeThroughPackDrop(makeItem("vaulted"))).toBe(false);
  });

  it("blocks listed and redemption-pending items from restricted actions", () => {
    expect(canRedeemItem(makeItem("listed"))).toBe(false);
    expect(canCraftItem(makeItem("listed"))).toBe(false);

    expect(canListItem(makeItem("redemption_pending"))).toBe(false);
    expect(canCraftItem(makeItem("redemption_pending"))).toBe(false);

    expect(canRedeemItem(makeItem("user_owned"))).toBe(true);
    expect(canCraftItem(makeItem("user_owned"))).toBe(true);
    expect(canListItem(makeItem("user_owned"))).toBe(true);
  });

  it("allows buyback-held items to recycle into drop-ready status after admin review", () => {
    const buybackHeld = makeItem("buyback_held");

    expect(canRecycleBuybackHeldItem(buybackHeld, { adminReviewed: false })).toBe(false);
    expect(canRecycleBuybackHeldItem(buybackHeld, { adminReviewed: true })).toBe(true);

    const recycled = transitionInventoryItem(buybackHeld, "drop_ready", "2026-07-08T02:00:00.000Z");
    expect(recycled.custodyStatus).toBe("drop_ready");
  });
});
