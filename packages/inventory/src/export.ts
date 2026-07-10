import { InventoryItemsSchema, type InventoryItem } from "./schema";

export const inventoryCsvColumns = [
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
] as const satisfies readonly (keyof InventoryItem)[];

const validateInventoryItems = (items: readonly InventoryItem[]): InventoryItem[] => {
  return InventoryItemsSchema.parse(items);
};

const serializeCsvValue = (value: InventoryItem[(typeof inventoryCsvColumns)[number]]): string => {
  if (value == null) {
    return "";
  }

  const text = Array.isArray(value) ? JSON.stringify(value) : String(value);
  const spreadsheetSafeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  const escaped = spreadsheetSafeText.replace(/"/g, '""');

  return /[",\n\r]/.test(spreadsheetSafeText) ? `"${escaped}"` : escaped;
};

export const exportInventoryAsJson = (items: readonly InventoryItem[]): string => {
  return JSON.stringify(validateInventoryItems(items), null, 2);
};

export const exportInventoryAsCsv = (items: readonly InventoryItem[]): string => {
  const rows = validateInventoryItems(items).map((item) => {
    return inventoryCsvColumns.map((column) => serializeCsvValue(item[column])).join(",");
  });

  return [inventoryCsvColumns.join(","), ...rows].join("\n");
};
