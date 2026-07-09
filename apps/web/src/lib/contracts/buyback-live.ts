import type { Abi, Address } from "viem";
import { buybackVaultAbi } from "./abis";

export type BuybackReadClient = {
  readContract: (parameters: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
};

export type LiveBuybackQuote = {
  tokenId: bigint;
  price: bigint;
  active: boolean;
};

export async function readBuybackQuote(
  client: BuybackReadClient,
  vault: Address,
  tokenId: bigint
): Promise<LiveBuybackQuote> {
  const raw = await client.readContract({
    address: vault,
    abi: buybackVaultAbi as Abi,
    functionName: "quotes",
    args: [tokenId]
  });
  const row = Array.isArray(raw) ? raw : [];
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};

  return {
    tokenId,
    price: toBigint(row[0] ?? record.price),
    active: (row[1] ?? record.active) === true
  };
}

function toBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") return BigInt(value);
  return 0n;
}
