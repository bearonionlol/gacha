import type { ProtocolContracts } from "./registry";
import type { WriteRequest } from "./transactions";

export type RedemptionAdminMode = "approve" | "markPacked" | "markShipped" | "complete" | "cancel";

export type RedemptionAdminRequestInput = {
  mode: RedemptionAdminMode;
  requestId: bigint | null;
  trackingRef: string;
  reason: string;
};

export const testnetWriteConfig = {
  pack: {
    dropId: 1n,
    value: 10_000_000_000_000_000n,
    displayValue: "0.01 ETH"
  },
  market: {
    amount: 1n,
    price: 15_000_000_000_000_000n,
    displayPrice: "0.015 ETH"
  },
  forge: {
    recipeId: 1n,
    value: 1_000_000_000_000_000n,
    displayValue: "0.001 ETH"
  }
} as const;

export function parsePositiveTokenId(value: string): bigint | null {
  return parsePositiveBigint(value);
}

export function parsePositiveActionId(value: string): bigint | null {
  return parsePositiveBigint(value);
}

function parsePositiveBigint(value: string): bigint | null {
  const trimmedValue = value.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const tokenId = BigInt(trimmedValue);
  return tokenId > 0n ? tokenId : null;
}

export function createPackRevealRequestForPurchase(
  contracts: ProtocolContracts,
  purchaseId: bigint | null
): WriteRequest | null {
  if (purchaseId === null) {
    return null;
  }

  return {
    kind: "packReveal",
    contracts,
    purchaseId
  };
}

export function createMarketListRequestForToken(
  contracts: ProtocolContracts,
  tokenId: bigint | null
): WriteRequest | null {
  if (tokenId === null) {
    return null;
  }

  return {
    kind: "marketList",
    contracts,
    tokenId,
    amount: testnetWriteConfig.market.amount,
    price: testnetWriteConfig.market.price
  };
}

export function createRedemptionRequestForToken(
  contracts: ProtocolContracts,
  tokenId: bigint | null
): WriteRequest | null {
  if (tokenId === null) {
    return null;
  }

  return {
    kind: "redemptionRequest",
    contracts,
    tokenId
  };
}

export function createRedemptionAdminRequest(
  contracts: ProtocolContracts,
  input: RedemptionAdminRequestInput
): WriteRequest | null {
  if (input.requestId === null) {
    return null;
  }

  if (input.mode === "approve") {
    return { kind: "redemptionApprove", contracts, requestId: input.requestId };
  }

  if (input.mode === "markPacked") {
    return { kind: "redemptionMarkPacked", contracts, requestId: input.requestId };
  }

  if (input.mode === "markShipped") {
    const trackingRef = input.trackingRef.trim();
    return trackingRef.length > 0
      ? { kind: "redemptionMarkShipped", contracts, requestId: input.requestId, trackingRef }
      : null;
  }

  if (input.mode === "complete") {
    return { kind: "redemptionComplete", contracts, requestId: input.requestId };
  }

  const reason = input.reason.trim();
  return reason.length > 0 ? { kind: "redemptionCancel", contracts, requestId: input.requestId, reason } : null;
}
