import type { InventoryItem, InventoryStatus } from "./schema";

export type InventoryTransitionOptions = {
  updatedAt?: string;
  adminReviewed?: boolean;
};

type InventoryTransitionInput = string | InventoryTransitionOptions;

export const allowedInventoryTransitions: Readonly<Record<InventoryStatus, readonly InventoryStatus[]>> = {
  draft: ["photographed"],
  photographed: ["verified"],
  verified: ["vaulted"],
  vaulted: ["drop_ready"],
  drop_ready: ["tokenized"],
  tokenized: ["user_owned"],
  user_owned: ["listed", "buyback_held", "redemption_pending"],
  listed: ["user_owned"],
  buyback_held: ["drop_ready"],
  redemption_pending: ["redeemed", "user_owned"],
  redeemed: []
};

export const getAllowedNextStatuses = (status: InventoryStatus): InventoryStatus[] => {
  return [...allowedInventoryTransitions[status]];
};

export const canTransitionStatus = (from: InventoryStatus, to: InventoryStatus): boolean => {
  return allowedInventoryTransitions[from].includes(to);
};

export const assertInventoryTransition = (from: InventoryStatus, to: InventoryStatus): void => {
  if (!canTransitionStatus(from, to)) {
    throw new Error(`Invalid inventory lifecycle transition: ${from} -> ${to}`);
  }
};

const resolveTransitionUpdatedAt = (options?: InventoryTransitionInput): string => {
  if (typeof options === "string") {
    return options;
  }

  return options?.updatedAt ?? new Date().toISOString();
};

const hasAdminReview = (options?: InventoryTransitionInput): boolean => {
  return typeof options === "object" && options.adminReviewed === true;
};

export const transitionInventoryItem = (
  item: InventoryItem,
  to: InventoryStatus,
  options?: InventoryTransitionInput
): InventoryItem => {
  assertInventoryTransition(item.custodyStatus, to);

  if (item.custodyStatus === "buyback_held" && to === "drop_ready" && !hasAdminReview(options)) {
    throw new Error("Buyback-held items require admin review before recycling into drops");
  }

  return {
    ...item,
    custodyStatus: to,
    updatedAt: resolveTransitionUpdatedAt(options)
  };
};

export const canAssignToDrop = (item: InventoryItem): boolean => {
  return item.dropEligibility && (item.custodyStatus === "vaulted" || item.custodyStatus === "drop_ready");
};

export const canVaultItem = (item: InventoryItem): boolean => {
  return item.custodyStatus === "verified";
};

export const canTokenizeThroughPackDrop = (item: InventoryItem): boolean => {
  return item.dropEligibility && item.custodyStatus === "drop_ready";
};

export const canRedeemItem = (item: InventoryItem): boolean => {
  return item.redeemable && item.custodyStatus === "user_owned";
};

export const canCraftItem = (item: InventoryItem): boolean => {
  return item.custodyStatus === "user_owned";
};

export const canListItem = (item: InventoryItem): boolean => {
  return item.custodyStatus === "user_owned";
};

export const canRecycleBuybackHeldItem = (
  item: InventoryItem,
  options: { adminReviewed: boolean }
): boolean => {
  return item.custodyStatus === "buyback_held" && options.adminReviewed;
};
