import { decodeEventLog, formatEther, parseEther, type Hex } from "viem";
import type { ProtocolContracts } from "./registry";
import type { WriteRequest } from "./transactions";
import { packSaleAbi } from "./abis";
import type { ChainContext } from "../deployments";

export type RedemptionAdminMode = "approve" | "markPacked" | "markShipped" | "complete" | "cancel";

export type RedemptionAdminRequestInput = {
  mode: RedemptionAdminMode;
  requestId: bigint | null;
  trackingRef: string;
  reason: string;
};

type TransactionConfigEnv = Record<string, string | undefined>;

const defaultWriteValues = {
  dropId: 1n,
  packPrice: 10_000_000_000_000_000n,
  marketPrice: 15_000_000_000_000_000n,
  forgeRecipeId: 2n,
  forgeFee: 1_000_000_000_000_000n
} as const;

function readPublicTransactionConfigEnv(): TransactionConfigEnv {
  return {
    NEXT_PUBLIC_GACHA_ALLOWLIST_PROOF: process.env.NEXT_PUBLIC_GACHA_ALLOWLIST_PROOF,
    NEXT_PUBLIC_GACHA_DEFAULT_LISTING_PRICE_WEI: process.env.NEXT_PUBLIC_GACHA_DEFAULT_LISTING_PRICE_WEI,
    NEXT_PUBLIC_GACHA_DROP_ID: process.env.NEXT_PUBLIC_GACHA_DROP_ID,
    NEXT_PUBLIC_GACHA_FORGE_FEE_WEI: process.env.NEXT_PUBLIC_GACHA_FORGE_FEE_WEI,
    NEXT_PUBLIC_GACHA_FORGE_RECIPE_ID: process.env.NEXT_PUBLIC_GACHA_FORGE_RECIPE_ID,
    NEXT_PUBLIC_GACHA_PACK_PRICE_WEI: process.env.NEXT_PUBLIC_GACHA_PACK_PRICE_WEI
  };
}

function parsePositiveEnvBigint(value: string | undefined, fallback: bigint): bigint {
  if (value === undefined || !/^\d+$/.test(value.trim())) return fallback;
  const parsed = BigInt(value.trim());
  return parsed > 0n ? parsed : fallback;
}

export function resolveProtocolWriteConfig(env?: TransactionConfigEnv) {
  const publicEnv = env ?? readPublicTransactionConfigEnv();
  const dropId = parsePositiveEnvBigint(publicEnv.NEXT_PUBLIC_GACHA_DROP_ID, defaultWriteValues.dropId);
  const packPrice = parsePositiveEnvBigint(publicEnv.NEXT_PUBLIC_GACHA_PACK_PRICE_WEI, defaultWriteValues.packPrice);
  const marketPrice = parsePositiveEnvBigint(
    publicEnv.NEXT_PUBLIC_GACHA_DEFAULT_LISTING_PRICE_WEI,
    defaultWriteValues.marketPrice
  );
  const forgeRecipeId = parsePositiveEnvBigint(
    publicEnv.NEXT_PUBLIC_GACHA_FORGE_RECIPE_ID,
    defaultWriteValues.forgeRecipeId
  );
  const forgeFee = parsePositiveEnvBigint(publicEnv.NEXT_PUBLIC_GACHA_FORGE_FEE_WEI, defaultWriteValues.forgeFee);

  return {
    pack: {
      dropId,
      value: packPrice,
      displayValue: `${formatEther(packPrice)} ETH`,
      allowlistProofInput: publicEnv.NEXT_PUBLIC_GACHA_ALLOWLIST_PROOF?.trim() ?? "",
      dropIdIsExplicit: publicEnv.NEXT_PUBLIC_GACHA_DROP_ID !== undefined,
      priceIsExplicit: publicEnv.NEXT_PUBLIC_GACHA_PACK_PRICE_WEI !== undefined
    },
    market: {
      amount: 1n,
      price: marketPrice,
      displayPrice: `${formatEther(marketPrice)} ETH`
    },
    forge: {
      recipeId: forgeRecipeId,
      value: forgeFee,
      displayValue: `${formatEther(forgeFee)} ETH`
    }
  } as const;
}

export const protocolWriteConfig = resolveProtocolWriteConfig();

// Kept as an export alias while call sites migrate to environment-neutral vocabulary.
export const testnetWriteConfig = protocolWriteConfig;

export function getPaidActionSafetyBlockReason(chainContext: ChainContext): string | null {
  if (!chainContext.isMainnet || chainContext.writesEnabled) return null;
  return chainContext.writeBlockReason ?? "Mainnet paid actions are locked until production launch metadata is complete and active.";
}

export function parsePositiveTokenId(value: string): bigint | null {
  return parsePositiveBigint(value);
}

export function parsePositiveActionId(value: string): bigint | null {
  return parsePositiveBigint(value);
}

export function parsePositiveEthAmount(value: string): bigint | null {
  const trimmedValue = value.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(trimmedValue)) return null;

  try {
    const parsed = parseEther(trimmedValue);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

export function parseAllowlistProof(value: string): Hex[] | null {
  const trimmedValue = value.trim();
  if (trimmedValue === "") return null;
  if (trimmedValue === "[]") return [];

  const entries = trimmedValue.split(/[\s,]+/).filter(Boolean);
  return entries.length > 0 && entries.every((entry) => /^0x[a-fA-F0-9]{64}$/.test(entry))
    ? entries as Hex[]
    : null;
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

export function createPackPurchaseRequest({
  allowlistProof,
  allowlistRoot,
  contracts,
  dropId,
  value
}: {
  allowlistProof: readonly Hex[] | null;
  allowlistRoot: Hex;
  contracts: ProtocolContracts;
  dropId: bigint;
  value: bigint;
}): WriteRequest | null {
  const isAllowlisted = !/^0x0{64}$/i.test(allowlistRoot);
  if (isAllowlisted && allowlistProof === null) return null;

  return isAllowlisted
    ? { kind: "packPurchaseAllowlisted", allowlistProof: allowlistProof ?? [], contracts, dropId, value }
    : { kind: "packPurchase", contracts, dropId, value };
}

export function extractPackPurchaseId(receipt: {
  logs: readonly { data: Hex; topics: readonly Hex[] }[];
}): bigint | null {
  for (const log of receipt.logs) {
    try {
      if (log.topics.length === 0) continue;
      const topics = [...log.topics] as [Hex, ...Hex[]];
      const decoded = decodeEventLog({ abi: packSaleAbi, data: log.data, topics, strict: false });
      if (decoded.eventName === "PackPurchased" && "purchaseId" in decoded.args) {
        const purchaseId = decoded.args.purchaseId;
        return typeof purchaseId === "bigint" && purchaseId > 0n ? purchaseId : null;
      }
    } catch {
      // Ignore unrelated receipt logs.
    }
  }

  return null;
}

export function createMarketListRequestForToken(
  contracts: ProtocolContracts,
  tokenId: bigint | null,
  price = protocolWriteConfig.market.price
): WriteRequest | null {
  if (tokenId === null || price <= 0n) {
    return null;
  }

  return {
    kind: "marketList",
    contracts,
    tokenId,
    amount: protocolWriteConfig.market.amount,
    price
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
