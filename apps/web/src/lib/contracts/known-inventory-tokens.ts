import { sampleInventory } from "@gacha/inventory";
import type { GrailTier } from "@gacha/inventory";
import type { Abi, Address } from "viem";
import { inventoryRegistryAbi, itemTokenAbi } from "./abis";
import { createRobinhoodPublicClient } from "./public-client";
import type { ProtocolContracts } from "./registry";

export type TokenReadClient = {
  readContract: (parameters: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
};

export type KnownInventoryToken = {
  inventoryId: string;
  title: string;
  subtitle: string;
  tokenId: bigint;
  balance: bigint;
  redeemable: boolean;
  grailTier: GrailTier;
};

export type KnownInventoryTokenScan =
  | { status: "ready"; message: string; tokens: KnownInventoryToken[] }
  | { status: "empty"; message: string; tokens: [] }
  | { status: "degraded"; message: string; tokens: [] };

type KnownInventoryTokenOptions = {
  account: Address;
  contracts: ProtocolContracts;
  client?: TokenReadClient;
};

export async function readKnownInventoryTokenStates({
  account,
  contracts,
  client = createRobinhoodPublicClient()
}: KnownInventoryTokenOptions): Promise<KnownInventoryTokenScan> {
  try {
    const tokens = (
      await Promise.all(
        sampleInventory.map(async (item) => {
          const tokenId = await readBigint(client, contracts.InventoryRegistry, inventoryRegistryAbi as Abi, [
            item.inventoryId
          ]);
          const balance = await readBigint(client, contracts.ItemToken, itemTokenAbi as Abi, [account, tokenId]);

          if (balance <= 0n) {
            return null;
          }

          return {
            inventoryId: item.inventoryId,
            title: item.cardName,
            subtitle: buildSubtitle(item),
            tokenId,
            balance,
            redeemable: item.redeemable,
            grailTier: item.grailTier
          } satisfies KnownInventoryToken;
        })
      )
    ).filter((token): token is KnownInventoryToken => token !== null);

    if (tokens.length === 0) {
      return {
        status: "empty",
        message: "No seeded inventory tokens found for this wallet.",
        tokens: []
      };
    }

    return {
      status: "ready",
      message: `Found ${tokens.length} seeded inventory token${tokens.length === 1 ? "" : "s"}.`,
      tokens
    };
  } catch {
    return {
      status: "degraded",
      message: "Unable to scan known seeded inventory right now. Manual token ID entry remains available.",
      tokens: []
    };
  }
}

async function readBigint(
  client: TokenReadClient,
  address: Address,
  abi: Abi,
  args: readonly unknown[]
): Promise<bigint> {
  const functionName = args.length === 1 ? "derivePhysicalTokenId" : "balanceOf";
  const value = await client.readContract({ address, abi, functionName, args });

  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" || typeof value === "string") {
    return BigInt(value);
  }

  return 0n;
}

type SampleInventoryItem = (typeof sampleInventory)[number];

function buildSubtitle(item: SampleInventoryItem): string {
  const condition = item.gradingCompany && item.grade ? `${item.gradingCompany} ${item.grade}` : item.rawConditionEstimate;

  return [item.setName, item.cardNumber, item.variant, condition].filter(Boolean).join(" / ");
}
