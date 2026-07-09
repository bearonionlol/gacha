import type { Abi, Address } from "viem";
import { marketplaceAbi } from "./abis";

export type MarketplaceReadClient = {
  readContract: (parameters: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
};

export type LiveMarketplaceListing = {
  id: bigint;
  seller: Address;
  tokenId: bigint;
  amount: bigint;
  price: bigint;
  active: boolean;
  sold: boolean;
  cancelled: boolean;
};

export async function readMarketplaceListing(
  client: MarketplaceReadClient,
  marketplace: Address,
  listingId: bigint
): Promise<LiveMarketplaceListing | null> {
  const raw = await client.readContract({
    address: marketplace,
    abi: marketplaceAbi as Abi,
    functionName: "listings",
    args: [listingId]
  });
  const listing = normalizeListing(raw);
  return listing.seller === "0x0000000000000000000000000000000000000000"
    ? null
    : { id: listingId, ...listing };
}

function normalizeListing(value: unknown): Omit<LiveMarketplaceListing, "id"> {
  const row = Array.isArray(value) ? value : [];
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    seller: toAddress(row[0] ?? record.seller),
    tokenId: toBigint(row[1] ?? record.tokenId),
    amount: toBigint(row[2] ?? record.amount),
    price: toBigint(row[3] ?? record.price),
    active: (row[4] ?? record.active) === true,
    sold: (row[5] ?? record.sold) === true,
    cancelled: (row[6] ?? record.cancelled) === true
  };
}

function toBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") return BigInt(value);
  return 0n;
}

function toAddress(value: unknown): Address {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? value as Address
    : "0x0000000000000000000000000000000000000000";
}
