import type { Abi, Address } from "viem";
import { ROBINHOOD_CHAIN_TESTNET_ID } from "@gacha/shared";
import type { DeploymentRegistrySnapshot } from "../deployments";
import { forgeAbi, marketplaceAbi, packSaleAbi, redemptionRegistryAbi } from "./abis";
import { createRobinhoodPublicClient } from "./public-client";
import { getReadyContractRegistry } from "./registry";

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

type LiveProtocolOptions = {
  registrySnapshot: DeploymentRegistrySnapshot | null;
  client?: ProtocolReadClient;
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
  client = createRobinhoodPublicClient(),
  timeoutMs = DEFAULT_READ_TIMEOUT_MS
}: LiveProtocolOptions): Promise<LiveProtocolSnapshot> {
  const registry = getReadyContractRegistry(registrySnapshot);

  if (registry.contracts === null) {
    return {
      state: "demo",
      title: "Live protocol offline",
      message: registry.status.message,
      metrics: []
    };
  }

  if (registry.chainId !== ROBINHOOD_CHAIN_TESTNET_ID) {
    return {
      state: "demo",
      title: "Live protocol locked to testnet",
      message: "Phase 4A live reads are testnet only. Switch the deployment registry to Robinhood Chain Testnet.",
      metrics: []
    };
  }

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
        readBigint(client, registry.contracts.PackSale, packSaleAbi as Abi, "nextDropId"),
        readBigint(client, registry.contracts.PackSale, packSaleAbi as Abi, "nextPurchaseId"),
        readBigint(client, registry.contracts.PackSale, packSaleAbi as Abi, "treasuryCredit"),
        readBigint(client, registry.contracts.PackSale, packSaleAbi as Abi, "remainingInventory", [1n]).catch(() => 0n),
        readBigint(client, registry.contracts.Marketplace, marketplaceAbi as Abi, "nextListingId"),
        readBigint(client, registry.contracts.Marketplace, marketplaceAbi as Abi, "feeBps"),
        readBigint(client, registry.contracts.Forge, forgeAbi as Abi, "nextRecipeId"),
        readBigint(client, registry.contracts.RedemptionRegistry, redemptionRegistryAbi as Abi, "nextRequestId")
      ]),
      timeoutMs
    );

    return {
      state: "ready",
      title: "Live protocol connected",
      message: `Reading Robinhood testnet contracts on chain ${registry.chainId}.`,
      metrics: [
        { label: "Drops created", value: bigintToString(nextDropId - 1n), detail: "PackSale.nextDropId" },
        { label: "Purchases opened", value: bigintToString(nextPurchaseId - 1n), detail: "PackSale.nextPurchaseId" },
        { label: "Drop 1 inventory", value: bigintToString(remainingInventory), detail: "PackSale.remainingInventory" },
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
      title: "Live protocol degraded",
      message: "Robinhood testnet RPC is temporarily unavailable. Browsing remains in read-only mode.",
      metrics: []
    };
  }
}
