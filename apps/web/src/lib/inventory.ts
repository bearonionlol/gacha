import { sampleInventory, type InventoryItem } from "@gacha/inventory";

export type CollectibleCard = {
  id: string;
  title: string;
  brandLabel: string;
  categoryLabel: string;
  subtitle: string;
  estimateCents: number;
  buybackCents: number;
  grailTier: string;
  redeemable: boolean;
  tags: string[];
  legalDisclaimer: string;
  photoHash: string;
};

const brandLabels: Record<InventoryItem["brand"], string> = {
  one_piece: "One Piece Card Game",
  other: "Other Collectible",
  pokemon: "Pokemon TCG"
};

const categoryLabels: Record<InventoryItem["category"], string> = {
  accessory: "Accessory",
  box: "Box",
  graded_card: "Graded Card",
  promo: "Promo",
  raw_card: "Raw Card",
  sealed_product: "Sealed Product",
  slab: "Slab"
};

const buildSubtitle = (item: InventoryItem): string => {
  const condition = item.gradingCompany && item.grade ? `${item.gradingCompany} ${item.grade}` : item.rawConditionEstimate;

  return [item.setName, item.cardNumber, item.variant, condition].filter(Boolean).join(" / ");
};

export const collectibleCards: CollectibleCard[] = sampleInventory.map((item) => ({
  id: item.inventoryId,
  title: item.cardName,
  brandLabel: brandLabels[item.brand],
  categoryLabel: categoryLabels[item.category],
  subtitle: buildSubtitle(item),
  estimateCents: item.marketEstimateCents,
  buybackCents: item.buybackQuoteCents,
  grailTier: item.grailTier,
  redeemable: item.redeemable,
  tags: item.craftingTags,
  legalDisclaimer: item.legalDisclaimer,
  photoHash: item.photoHash
}));

export const vaultStats = {
  totalItems: collectibleCards.length,
  marketValueCents: collectibleCards.reduce((total, card) => total + card.estimateCents, 0),
  buybackValueCents: collectibleCards.reduce((total, card) => total + card.buybackCents, 0),
  grailCount: collectibleCards.filter((card) => card.grailTier === "grail" || card.grailTier === "major").length
};
