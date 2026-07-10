import type { InventoryItem, InventoryStatus } from "@gacha/inventory";

export const brands = ["pokemon", "one_piece", "other"] as const;
export const categories = ["raw_card", "graded_card", "sealed_product", "promo", "slab", "box", "accessory"] as const;
export const statuses = [
  "draft",
  "photographed",
  "verified",
  "vaulted",
  "drop_ready",
  "tokenized",
  "user_owned",
  "listed",
  "buyback_held",
  "redemption_pending",
  "redeemed"
] as const;
export const grailTiers = ["none", "minor", "major", "grail"] as const;

export const onchainManagedStatuses = new Set<InventoryStatus>([
  "tokenized",
  "user_owned",
  "listed",
  "buyback_held",
  "redemption_pending",
  "redeemed"
]);

const allowedNextStatuses: Readonly<Partial<Record<InventoryStatus, readonly InventoryStatus[]>>> = {
  draft: ["photographed"],
  photographed: ["verified"],
  verified: ["vaulted"],
  vaulted: ["drop_ready"],
  drop_ready: ["tokenized"],
  tokenized: ["user_owned"],
  user_owned: ["listed", "buyback_held", "redemption_pending"],
  listed: ["user_owned"],
  buyback_held: ["drop_ready"],
  redemption_pending: ["redeemed", "user_owned"]
};

export const getManualNextStatuses = (status: InventoryStatus): InventoryStatus[] => {
  if (onchainManagedStatuses.has(status)) return [];
  return (allowedNextStatuses[status] ?? []).filter((next) => !onchainManagedStatuses.has(next));
};

export const createDraftInventoryItem = (): InventoryItem => {
  const now = new Date().toISOString();
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  return {
    inventoryId: `inv-${randomId}`,
    brand: "pokemon",
    category: "raw_card",
    cardName: "",
    setName: "",
    cardNumber: "",
    language: "English",
    edition: "",
    variant: "",
    rawConditionEstimate: "",
    conditionNotes: "",
    gradingCompany: null,
    grade: null,
    certNumber: null,
    certUrl: null,
    photoUrls: [],
    photoHash: `sha256:${"0".repeat(64)}`,
    vaultLocationLabel: "",
    custodyStatus: "draft",
    redeemable: true,
    marketEstimateCents: 0,
    buybackQuoteCents: 0,
    grailTier: "none",
    canonicalCollectibleKey: "pending",
    forgeTier: 1,
    tradeInEligible: false,
    tierPoolEligible: false,
    forgeSetKey: "pending",
    craftingTags: [],
    dropEligibility: false,
    legalDisclaimer: "Authentic resale collectible descriptor only; no affiliation or endorsement is claimed.",
    createdAt: now,
    updatedAt: now
  };
};

export const formatInventoryStatus = (status: string): string => status.replaceAll("_", " ");

export const canEditRole = (role: string | undefined): boolean => {
  return role === "inventory_operator" || role === "inventory_manager" || role === "admin";
};

export const canManageRole = (role: string | undefined): boolean => role === "inventory_manager" || role === "admin";
