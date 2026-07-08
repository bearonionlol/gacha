import { z } from "zod";

export const supportedBrands = ["pokemon", "one_piece", "other"] as const;

export type SupportedBrand = "pokemon" | "one_piece" | "other";

export const inventoryCategories = [
  "raw_card",
  "graded_card",
  "sealed_product",
  "promo",
  "slab",
  "box",
  "accessory"
] as const;

export type InventoryCategory =
  | "raw_card"
  | "graded_card"
  | "sealed_product"
  | "promo"
  | "slab"
  | "box"
  | "accessory";

export const inventoryStatuses = [
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

export type InventoryStatus =
  | "draft"
  | "photographed"
  | "verified"
  | "vaulted"
  | "drop_ready"
  | "tokenized"
  | "user_owned"
  | "listed"
  | "buyback_held"
  | "redemption_pending"
  | "redeemed";

export const grailTiers = ["none", "minor", "major", "grail"] as const;

export type GrailTier = "none" | "minor" | "major" | "grail";

export type InventoryItem = {
  inventoryId: string;
  brand: SupportedBrand;
  category: InventoryCategory;
  cardName: string;
  setName: string;
  cardNumber: string;
  language: string;
  edition: string;
  variant: string;
  rawConditionEstimate: string;
  conditionNotes: string;
  gradingCompany: string;
  grade: string;
  certNumber: string;
  certUrl: string;
  photoUrls: string[];
  photoHash: string;
  vaultLocationLabel: string;
  custodyStatus: InventoryStatus;
  redeemable: boolean;
  marketEstimateCents: number;
  buybackQuoteCents: number;
  grailTier: GrailTier;
  craftingTags: string[];
  dropEligibility: boolean;
  legalDisclaimer: string;
  createdAt: string;
  updatedAt: string;
};

const textField = z.string();
const requiredTextField = z.string().min(1);
const isoDateTime = z.string().datetime({ offset: true });
const cents = z.number().int().nonnegative();
const photoHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const optionalUrl = z.union([z.literal(""), z.string().url()]);

export const SupportedBrandSchema = z.enum(supportedBrands);
export const InventoryCategorySchema = z.enum(inventoryCategories);
export const InventoryStatusSchema = z.enum(inventoryStatuses);
export const GrailTierSchema = z.enum(grailTiers);

export const InventoryItemSchema: z.ZodType<InventoryItem> = z
  .object({
    inventoryId: requiredTextField,
    brand: SupportedBrandSchema,
    category: InventoryCategorySchema,
    cardName: requiredTextField,
    setName: requiredTextField,
    cardNumber: textField,
    language: requiredTextField,
    edition: textField,
    variant: textField,
    rawConditionEstimate: textField,
    conditionNotes: textField,
    gradingCompany: textField,
    grade: textField,
    certNumber: textField,
    certUrl: optionalUrl,
    photoUrls: z.array(requiredTextField),
    photoHash,
    vaultLocationLabel: textField,
    custodyStatus: InventoryStatusSchema,
    redeemable: z.boolean(),
    marketEstimateCents: cents,
    buybackQuoteCents: cents,
    grailTier: GrailTierSchema,
    craftingTags: z.array(requiredTextField),
    dropEligibility: z.boolean(),
    legalDisclaimer: requiredTextField,
    createdAt: isoDateTime,
    updatedAt: isoDateTime
  })
  .strict();

export const InventoryItemsSchema: z.ZodType<InventoryItem[]> = z.array(InventoryItemSchema);
