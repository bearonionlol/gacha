import { z } from "zod";

import { createPhotoHash } from "./photo-hash";

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
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  certUrl: string | null;
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
const nullableTextField = z.string().nullable();
const nullableUrl = z.union([z.string().url(), z.null()]);
const categoriesWithRequiredGradingFields: readonly InventoryCategory[] = ["graded_card", "slab"];
const gradedOnlyFields = ["gradingCompany", "grade", "certNumber", "certUrl"] as const;

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
    gradingCompany: nullableTextField,
    grade: nullableTextField,
    certNumber: nullableTextField,
    certUrl: nullableUrl,
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
  .strict()
  .superRefine((item, ctx) => {
    if (item.photoHash !== createPhotoHash(item.photoUrls)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["photoHash"],
        message: "photoHash must match the canonical hash of photoUrls"
      });
    }

    if (categoriesWithRequiredGradingFields.includes(item.category)) {
      for (const field of gradedOnlyFields) {
        const value = item[field];

        if (typeof value !== "string" || value.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required for graded cards and slabs`
          });
        }
      }
    }
  });

export const InventoryItemsSchema: z.ZodType<InventoryItem[]> = z.array(InventoryItemSchema);
