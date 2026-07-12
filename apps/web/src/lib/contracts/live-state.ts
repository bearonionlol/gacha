import type { Abi, Address, Hex } from "viem";
import { resolveChainContext, type DeploymentRegistrySnapshot } from "../deployments";
import { forgeAbi, marketplaceAbi, packSaleAbi, redemptionRegistryAbi } from "./abis";
import { getReadyContractRegistry } from "./registry";
import { createConfiguredPublicClient } from "./transactions";

export type ProtocolReadClient = {
  readContract: (parameters: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
};

export type LiveProtocolMetric = {
  label: string;
  value: string;
  detail: string;
};

export type LiveProtocolSnapshot = {
  state: "demo" | "ready" | "degraded";
  title: string;
  message: string;
  metrics: LiveProtocolMetric[];
};

export type LiveDropSummary = {
  allowlistRoot: Hex;
  dropId: bigint;
  endTime: bigint;
  maxPerWallet: bigint;
  maxSupply: bigint;
  name: string;
  pendingPurchases: bigint;
  price: bigint;
  purchasesByWallet: bigint | null;
  remainingInventory: bigint;
  sold: bigint;
  startTime: bigint;
};

type LiveProtocolOptions = {
  registrySnapshot: DeploymentRegistrySnapshot | null;
  client?: ProtocolReadClient;
  dropId?: bigint;
  timeoutMs?: number;
};

const DEFAULT_READ_TIMEOUT_MS = 4000;
const bigintToString = (value: bigint): string => value.toString();

async function readBigint(
  client: ProtocolReadClient,
  address: Address,
  abi: Abi,
  functionName: string,
  args?: readonly unknown[]
): Promise<bigint> {
  const value = await client.readContract({ address, abi, functionName, args });

  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" || typeof value === "string") {
    return BigInt(value);
  }

  return 0n;
}

export async function readLiveDropSummary({
  account = null,
  address,
  client,
  dropId
}: {
  account?: Address | null;
  address: Address;
  client: ProtocolReadClient;
  dropId: bigint;
}): Promise<LiveDropSummary> {
  const rawSummary = await client.readContract({
    address,
    abi: packSaleAbi as Abi,
    functionName: "getDropSummary",
    args: [dropId]
  });

  if (rawSummary === null || typeof rawSummary !== "object") {
    throw new Error("INVALID_DROP_SUMMARY");
  }

  const row = Array.isArray(rawSummary) ? rawSummary : [];
  const summary = !Array.isArray(rawSummary) ? rawSummary as Record<string, unknown> : {};
  const purchasesByWallet = account === null
    ? null
    : await readBigint(client, address, packSaleAbi as Abi, "purchasesByWallet", [dropId, account]);

  return {
    allowlistRoot: toBytes32(row[6] ?? summary.allowlistRoot),
    dropId,
    endTime: toBigint(row[3] ?? summary.endTime),
    maxPerWallet: toBigint(row[5] ?? summary.maxPerWallet),
    maxSupply: toBigint(row[4] ?? summary.maxSupply),
    name: typeof (row[0] ?? summary.name) === "string" ? String(row[0] ?? summary.name) : "Vault capsule",
    pendingPurchases: toBigint(row[8] ?? summary.pendingPurchases),
    price: toBigint(row[1] ?? summary.price),
    purchasesByWallet,
    remainingInventory: toBigint(row[9] ?? summary.remainingInventory),
    sold: toBigint(row[7] ?? summary.sold),
    startTime: toBigint(row[2] ?? summary.startTime)
  };
}

function toBytes32(value: unknown): Hex {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value)
    ? value as Hex
    : `0x${"0".repeat(64)}` as Hex;
}

function toBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") return BigInt(value);
  throw new Error("INVALID_DROP_SUMMARY");
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("LIVE_PROTOCOL_READ_TIMEOUT"));
    }, Math.max(0, timeoutMs));

    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function getLiveProtocolSnapshot({
  registrySnapshot,
  client,
  dropId = 1n,
  timeoutMs = DEFAULT_READ_TIMEOUT_MS
}: LiveProtocolOptions): Promise<LiveProtocolSnapshot> {
  const registry = getReadyContractRegistry(registrySnapshot);
  const chainContext = resolveChainContext(registrySnapshot);

  if (registry.contracts === null) {
    return {
      state: "demo",
      title: chainContext.isDemo ? "Demo protocol preview" : "Protocol unavailable",
      message: registry.status.message,
      metrics: []
    };
  }

  const readClient = client ?? createConfiguredPublicClient(chainContext);

  try {
    const [
      nextDropId,
      nextPurchaseId,
      treasuryCredit,
      remainingInventory,
      nextListingId,
      feeBps,
      nextRecipeId,
      nextRequestId
    ] = await withTimeout(
      Promise.all([
        readBigint(readClient, registry.contracts.PackSale, packSaleAbi as Abi, "nextDropId"),
        readBigint(readClient, registry.contracts.PackSale, packSaleAbi as Abi, "nextPurchaseId"),
        readBigint(readClient, registry.contracts.PackSale, packSaleAbi as Abi, "treasuryCredit"),
        readBigint(readClient, registry.contracts.PackSale, packSaleAbi as Abi, "remainingInventory", [dropId]).catch(() => 0n),
        readBigint(readClient, registry.contracts.Marketplace, marketplaceAbi as Abi, "nextListingId"),
        readBigint(readClient, registry.contracts.Marketplace, marketplaceAbi as Abi, "feeBps"),
        readBigint(readClient, registry.contracts.Forge, forgeAbi as Abi, "nextRecipeId"),
        readBigint(readClient, registry.contracts.RedemptionRegistry, redemptionRegistryAbi as Abi, "nextRequestId")
      ]),
      timeoutMs
    );

    return {
      state: "ready",
      title: "Protocol connected",
      message: `Reading ${chainContext.chainName} contracts on chain ${registry.chainId}.`,
      metrics: [
        { label: "Drops created", value: bigintToString(nextDropId - 1n), detail: "PackSale.nextDropId" },
        { label: "Purchases opened", value: bigintToString(nextPurchaseId - 1n), detail: "PackSale.nextPurchaseId" },
        { label: `Drop ${dropId} inventory`, value: bigintToString(remainingInventory), detail: "PackSale.remainingInventory" },
        { label: "Treasury credit", value: `${bigintToString(treasuryCredit)} wei`, detail: "PackSale.treasuryCredit" },
        { label: "Listings created", value: bigintToString(nextListingId - 1n), detail: "Marketplace.nextListingId" },
        { label: "Market fee", value: `${bigintToString(feeBps)} bps`, detail: "Marketplace.feeBps" },
        { label: "Recipes created", value: bigintToString(nextRecipeId - 1n), detail: "Forge.nextRecipeId" },
        {
          label: "Redemptions opened",
          value: bigintToString(nextRequestId - 1n),
          detail: "RedemptionRegistry.nextRequestId"
        }
      ]
    };
  } catch (error) {
    return {
      state: "degraded",
      title: "Protocol connection delayed",
      message: `${chainContext.chainName} data is temporarily unavailable. Browsing remains in read-only mode.`,
      metrics: []
    };
  }
}
