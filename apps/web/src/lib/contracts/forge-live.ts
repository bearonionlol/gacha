import type { Abi, Address, Hex } from "viem";
import { forgeAbi, itemTokenAbi } from "./abis";

export type ForgeReadClient = {
  readContract: (parameters: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
};

export type ForgeLiveRecipe = {
  outputTokenId: bigint;
  outputAmount: bigint;
  fee: bigint;
  maxTotalCrafts: bigint;
  maxCraftsPerWallet: bigint;
  totalCrafts: bigint;
  status: number;
  outputSupplyCap: bigint;
  blueprintHash: Hex;
};

export type ForgeWalletSnapshot = {
  recipe: ForgeLiveRecipe;
  balances: Map<bigint, bigint>;
  walletCrafts: bigint;
  approved: boolean;
};

export async function getForgeWalletSnapshot(input: {
  account: Address;
  client: ForgeReadClient;
  contracts: { Forge: Address; ItemToken: Address };
  recipeId: bigint;
  tokenIds: readonly bigint[];
}): Promise<ForgeWalletSnapshot> {
  const uniqueTokenIds = [...new Set(input.tokenIds)];
  const [rawRecipe, rawWalletCrafts, rawApproved, rawBalances] = await Promise.all([
    input.client.readContract({
      address: input.contracts.Forge,
      abi: forgeAbi as Abi,
      functionName: "recipes",
      args: [input.recipeId]
    }),
    input.client.readContract({
      address: input.contracts.Forge,
      abi: forgeAbi as Abi,
      functionName: "walletCrafts",
      args: [input.recipeId, input.account]
    }),
    input.client.readContract({
      address: input.contracts.ItemToken,
      abi: itemTokenAbi as Abi,
      functionName: "isApprovedForAll",
      args: [input.account, input.contracts.Forge]
    }),
    Promise.all(
      uniqueTokenIds.map((tokenId) =>
        input.client.readContract({
          address: input.contracts.ItemToken,
          abi: itemTokenAbi as Abi,
          functionName: "balanceOf",
          args: [input.account, tokenId]
        })
      )
    )
  ]);

  return {
    recipe: normalizeRecipe(rawRecipe),
    balances: new Map(uniqueTokenIds.map((tokenId, index) => [tokenId, toBigint(rawBalances[index])])),
    walletCrafts: toBigint(rawWalletCrafts),
    approved: rawApproved === true
  };
}

function normalizeRecipe(value: unknown): ForgeLiveRecipe {
  if (Array.isArray(value)) {
    return {
      outputTokenId: toBigint(value[0]),
      outputAmount: toBigint(value[1]),
      fee: toBigint(value[3]),
      maxTotalCrafts: toBigint(value[6]),
      maxCraftsPerWallet: toBigint(value[7]),
      totalCrafts: toBigint(value[8]),
      status: Number(toBigint(value[9])),
      outputSupplyCap: toBigint(value[13]),
      blueprintHash: toHex(value[15])
    };
  }

  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    outputTokenId: toBigint(record.outputTokenId),
    outputAmount: toBigint(record.outputAmount),
    fee: toBigint(record.fee),
    maxTotalCrafts: toBigint(record.maxTotalCrafts),
    maxCraftsPerWallet: toBigint(record.maxCraftsPerWallet),
    totalCrafts: toBigint(record.totalCrafts),
    status: Number(toBigint(record.status)),
    outputSupplyCap: toBigint(record.outputSupplyCap),
    blueprintHash: toHex(record.blueprintHash)
  };
}

function toBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") return BigInt(value);
  return 0n;
}

function toHex(value: unknown): Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
    ? value as Hex
    : `0x${"0".repeat(64)}`;
}
