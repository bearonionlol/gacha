import type { BrowserSeededInventoryItem } from "./browser-seeded-inventory";

export type InventoryReconciliationSeverity = "error" | "warning";
export type InventoryReconciliationSummary = "blocked" | "needs_review" | "ready";

export type InventoryReconciliationIssue = {
  detail: string;
  id: string;
  inventoryIds: string[];
  label: string;
  severity: InventoryReconciliationSeverity;
};

export type InventoryReconciliation = {
  counts: {
    dropEligible: number;
    protectedGrails: number;
    tierPoolEligible: number;
    total: number;
    tradeInEligible: number;
  };
  issues: InventoryReconciliationIssue[];
  summary: InventoryReconciliationSummary;
  tierPoolByTier: Record<1 | 2 | 3 | 4, number>;
};

const dropCustodyStates = new Set(["verified", "vaulted", "drop_ready", "tokenized"]);

export function reconcileInventory(
  items: readonly BrowserSeededInventoryItem[]
): InventoryReconciliation {
  const issues: InventoryReconciliationIssue[] = [];

  if (items.length === 0) {
    issues.push({
      id: "empty-inventory",
      inventoryIds: [],
      label: "No inventory loaded",
      detail: "At least one reviewed physical item is required before a drop or tier pool can be seeded.",
      severity: "error"
    });
  }

  addDuplicateIssues(items, "inventoryId", "duplicate-inventory-id", "Duplicate inventory ID", issues);
  addDuplicateIssues(items, "photoHash", "duplicate-photo-hash", "Duplicate photo hash", issues);

  const gradedItems = items.filter((item) => item.certNumber !== null && item.certNumber.trim() !== "");
  addDuplicateIssues(gradedItems, "certNumber", "duplicate-cert-number", "Duplicate grading certificate", issues);

  for (const item of items) {
    if (item.marketEstimateCents <= 0 || item.buybackQuoteCents < 0) {
      issues.push({
        id: `invalid-valuation:${item.inventoryId}`,
        inventoryIds: [item.inventoryId],
        label: "Invalid valuation",
        detail: `${item.cardName} requires a positive market estimate and a non-negative buyback quote.`,
        severity: "error"
      });
    }

    if (item.buybackQuoteCents > item.marketEstimateCents) {
      issues.push({
        id: `buyback-above-market:${item.inventoryId}`,
        inventoryIds: [item.inventoryId],
        label: "Buyback exceeds market estimate",
        detail: `${item.cardName} would create an immediately exploitable buyback path.`,
        severity: "error"
      });
    }

    if (item.dropEligibility && !dropCustodyStates.has(item.custodyStatus)) {
      issues.push({
        id: `drop-custody:${item.inventoryId}`,
        inventoryIds: [item.inventoryId],
        label: "Drop item is not custody ready",
        detail: `${item.cardName} is marked drop eligible while custody is ${item.custodyStatus}.`,
        severity: "error"
      });
    }

    if (item.tierPoolEligible && !dropCustodyStates.has(item.custodyStatus)) {
      issues.push({
        id: `tier-pool-custody:${item.inventoryId}`,
        inventoryIds: [item.inventoryId],
        label: "Tier-pool item is not custody ready",
        detail: `${item.cardName} cannot back a Forge output while custody is ${item.custodyStatus}.`,
        severity: "error"
      });
    }

    if (item.grailTier === "grail" && item.tradeInEligible) {
      issues.push({
        id: `grail-trade-in:${item.inventoryId}`,
        inventoryIds: [item.inventoryId],
        label: "Grail trade-in is enabled",
        detail: `${item.cardName} must remain protected unless an explicit reviewed policy changes its status.`,
        severity: "error"
      });
    }

    if (item.photoUrls.length < 2) {
      issues.push({
        id: `photo-coverage:${item.inventoryId}`,
        inventoryIds: [item.inventoryId],
        label: "Incomplete photo coverage",
        detail: `${item.cardName} needs at least front and back custody photos before public intake.`,
        severity: "warning"
      });
    }
  }

  const tierPoolByTier = {
    1: countTierPoolItems(items, 1),
    2: countTierPoolItems(items, 2),
    3: countTierPoolItems(items, 3),
    4: countTierPoolItems(items, 4)
  };

  for (const tier of [1, 2, 3, 4] as const) {
    if (items.length > 0 && tierPoolByTier[tier] === 0) {
      issues.push({
        id: `empty-tier-pool:${tier}`,
        inventoryIds: [],
        label: `Tier ${tier} pool is empty`,
        detail: `Ascension into Tier ${tier} must stay disabled until reviewed output inventory is reserved.`,
        severity: "warning"
      });
    }
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  const hasWarnings = issues.some((issue) => issue.severity === "warning");

  return {
    counts: {
      dropEligible: items.filter((item) => item.dropEligibility).length,
      protectedGrails: items.filter((item) => item.grailTier === "grail" && !item.tradeInEligible).length,
      tierPoolEligible: items.filter((item) => item.tierPoolEligible).length,
      total: items.length,
      tradeInEligible: items.filter((item) => item.tradeInEligible).length
    },
    issues,
    summary: hasErrors ? "blocked" : hasWarnings ? "needs_review" : "ready",
    tierPoolByTier
  };
}

function countTierPoolItems(items: readonly BrowserSeededInventoryItem[], tier: 1 | 2 | 3 | 4): number {
  return items.filter((item) => item.tierPoolEligible && item.forgeTier === tier).length;
}

function addDuplicateIssues(
  items: readonly BrowserSeededInventoryItem[],
  key: "certNumber" | "inventoryId" | "photoHash",
  id: string,
  label: string,
  issues: InventoryReconciliationIssue[]
): void {
  const groups = new Map<string, string[]>();

  for (const item of items) {
    const value = item[key];
    if (typeof value !== "string" || value.trim() === "") continue;
    groups.set(value, [...(groups.get(value) ?? []), item.inventoryId]);
  }

  for (const inventoryIds of groups.values()) {
    if (inventoryIds.length < 2) continue;
    issues.push({
      id: `${id}:${inventoryIds.join(":")}`,
      inventoryIds,
      label,
      detail: `${inventoryIds.join(", ")} share a value that must identify one physical custody record.`,
      severity: "error"
    });
  }
}
