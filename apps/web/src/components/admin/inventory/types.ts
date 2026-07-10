import type {
  InventoryAuditEvent,
  InventoryItem,
  InventoryOnchainAction,
  InventoryOnchainOperation,
  VersionedInventoryItem
} from "@gacha/inventory";

export type AdminConsoleConfiguration = {
  configured: boolean;
  mode: "production" | "demo_readonly";
  onchainQueueConfigured: boolean;
  reason: string;
};

export type AdminSessionView = {
  expiresAt: string;
  role: "viewer" | "inventory_operator" | "inventory_manager" | "admin";
  walletAddress: string;
};

export type InventoryRecord = VersionedInventoryItem;
export type InventoryRecordItem = InventoryItem;
export type InventoryAuditRecord = InventoryAuditEvent;
export type OnchainQueueAction = InventoryOnchainAction;
export type OnchainQueueRecord = InventoryOnchainOperation;

export type InventoryFilters = {
  brand: "" | InventoryItem["brand"];
  search: string;
  status: "" | InventoryItem["custodyStatus"];
};
