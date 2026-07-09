import type { ProtocolContracts } from "./registry";
import type { WriteRequest } from "./transactions";

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
  const trimmedValue = value.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const tokenId = BigInt(trimmedValue);
  return tokenId > 0n ? tokenId : null;
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
