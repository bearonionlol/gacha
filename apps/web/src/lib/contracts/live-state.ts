import type { Abi, Address } from "viem";
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
};

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

export async function getLiveProtocolSnapshot({
  registrySnapshot,
  client = createRobinhoodPublicClient()
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
    ] = await Promise.all([
      readBigint(client, registry.contracts.PackSale, packSaleAbi as Abi, "nextDropId"),
      readBigint(client, registry.contracts.PackSale, packSaleAbi as Abi, "nextPurchaseId"),
      readBigint(client, registry.contracts.PackSale, packSaleAbi as Abi, "treasuryCredit"),
      readBigint(client, registry.contracts.PackSale, packSaleAbi as Abi, "remainingInventory", [1n]).catch(() => 0n),
      readBigint(client, registry.contracts.Marketplace, marketplaceAbi as Abi, "nextListingId"),
      readBigint(client, registry.contracts.Marketplace, marketplaceAbi as Abi, "feeBps"),
      readBigint(client, registry.contracts.Forge, forgeAbi as Abi, "nextRecipeId"),
      readBigint(client, registry.contracts.RedemptionRegistry, redemptionRegistryAbi as Abi, "nextRequestId")
    ]);

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
      message: error instanceof Error ? error.message : "Robinhood testnet RPC read failed.",
      metrics: []
    };
  }
}
