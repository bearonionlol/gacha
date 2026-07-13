import {
  decodeEventLog,
  getAddress,
  parseAbi,
  type Address,
  type Hex
} from "viem";

import type { ProtocolContracts } from "../contracts/registry";

export const protocolEventAbi = parseAbi([
  "event PackPurchased(uint256 indexed purchaseId, uint256 indexed dropId, address indexed buyer, bytes32 requestId, uint256 price)",
  "event PackRevealed(uint256 indexed purchaseId, uint256 indexed dropId, address indexed buyer, string inventoryId, uint256 tokenId)",
  "event PackRefunded(uint256 indexed purchaseId, uint256 indexed dropId, address indexed buyer, uint256 price)",
  "event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 amount, uint256 price)",
  "event ListingCancelled(uint256 indexed listingId, address indexed seller)",
  "event ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 fee)",
  "event RedemptionRequested(uint256 indexed requestId, address indexed requester, uint256 indexed tokenId)",
  "event RedemptionStatusUpdated(uint256 indexed requestId, uint8 previousStatus, uint8 status)"
]);

export type ProtocolLog = {
  address: Address;
  blockHash: Hex | null;
  blockNumber: bigint | null;
  data: Hex;
  logIndex: number | null;
  topics: readonly Hex[];
  transactionHash: Hex | null;
};

export type ProtocolEventEvidence = {
  blockHash: Hex;
  blockNumber: bigint;
  chainId: number;
  contractAddress: Address;
  logIndex: number;
  transactionHash: Hex;
};

type EventBase<Kind extends string> = ProtocolEventEvidence & { kind: Kind };

export type ProtocolEvent =
  | (EventBase<"PackPurchased"> & {
      buyer: Address;
      dropId: bigint;
      price: bigint;
      purchaseId: bigint;
      requestId: Hex;
    })
  | (EventBase<"PackRevealed"> & {
      buyer: Address;
      dropId: bigint;
      inventoryId: string;
      purchaseId: bigint;
      tokenId: bigint;
    })
  | (EventBase<"PackRefunded"> & {
      buyer: Address;
      dropId: bigint;
      price: bigint;
      purchaseId: bigint;
    })
  | (EventBase<"ListingCreated"> & {
      amount: bigint;
      listingId: bigint;
      price: bigint;
      seller: Address;
      tokenId: bigint;
    })
  | (EventBase<"ListingCancelled"> & {
      listingId: bigint;
      seller: Address;
    })
  | (EventBase<"ListingSold"> & {
      buyer: Address;
      fee: bigint;
      listingId: bigint;
      price: bigint;
    })
  | (EventBase<"RedemptionRequested"> & {
      requestId: bigint;
      requester: Address;
      tokenId: bigint;
    })
  | (EventBase<"RedemptionStatusUpdated"> & {
      previousStatus: number;
      requestId: bigint;
      status: number;
    });

const packEvents = new Set(["PackPurchased", "PackRevealed", "PackRefunded"]);
const marketEvents = new Set(["ListingCreated", "ListingCancelled", "ListingSold"]);
const redemptionEvents = new Set(["RedemptionRequested", "RedemptionStatusUpdated"]);

export function decodeProtocolEvent(
  log: ProtocolLog,
  contracts: Pick<ProtocolContracts, "PackSale" | "Marketplace" | "RedemptionRegistry">,
  chainId: number
): ProtocolEvent | null {
  if (
    log.blockHash === null
    || log.blockNumber === null
    || log.logIndex === null
    || log.transactionHash === null
    || log.topics.length === 0
  ) {
    return null;
  }

  let decoded: ReturnType<typeof decodeEventLog>;
  try {
    decoded = decodeEventLog({
      abi: protocolEventAbi,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
      strict: true
    });
  } catch {
    return null;
  }

  const contractAddress = getAddress(log.address);
  const eventName = decoded.eventName;
  const isPackSale = sameAddress(contractAddress, contracts.PackSale);
  const isMarketplace = sameAddress(contractAddress, contracts.Marketplace);
  const isRedemptionRegistry = sameAddress(contractAddress, contracts.RedemptionRegistry);
  if (
    (isPackSale && !packEvents.has(eventName))
    || (isMarketplace && !marketEvents.has(eventName))
    || (isRedemptionRegistry && !redemptionEvents.has(eventName))
    || (!isPackSale && !isMarketplace && !isRedemptionRegistry)
  ) {
    return null;
  }

  const args = decoded.args as Record<string, unknown>;
  const evidence = {
    blockHash: log.blockHash,
    blockNumber: log.blockNumber,
    chainId,
    contractAddress,
    logIndex: log.logIndex,
    transactionHash: log.transactionHash
  };

  switch (eventName) {
    case "PackPurchased":
      return {
        ...evidence,
        kind: eventName,
        buyer: readAddress(args.buyer, "buyer"),
        dropId: readBigint(args.dropId, "dropId"),
        price: readBigint(args.price, "price"),
        purchaseId: readBigint(args.purchaseId, "purchaseId"),
        requestId: readHex(args.requestId, "requestId")
      };
    case "PackRevealed":
      return {
        ...evidence,
        kind: eventName,
        buyer: readAddress(args.buyer, "buyer"),
        dropId: readBigint(args.dropId, "dropId"),
        inventoryId: readString(args.inventoryId, "inventoryId"),
        purchaseId: readBigint(args.purchaseId, "purchaseId"),
        tokenId: readBigint(args.tokenId, "tokenId")
      };
    case "PackRefunded":
      return {
        ...evidence,
        kind: eventName,
        buyer: readAddress(args.buyer, "buyer"),
        dropId: readBigint(args.dropId, "dropId"),
        price: readBigint(args.price, "price"),
        purchaseId: readBigint(args.purchaseId, "purchaseId")
      };
    case "ListingCreated":
      return {
        ...evidence,
        kind: eventName,
        amount: readBigint(args.amount, "amount"),
        listingId: readBigint(args.listingId, "listingId"),
        price: readBigint(args.price, "price"),
        seller: readAddress(args.seller, "seller"),
        tokenId: readBigint(args.tokenId, "tokenId")
      };
    case "ListingCancelled":
      return {
        ...evidence,
        kind: eventName,
        listingId: readBigint(args.listingId, "listingId"),
        seller: readAddress(args.seller, "seller")
      };
    case "ListingSold":
      return {
        ...evidence,
        kind: eventName,
        buyer: readAddress(args.buyer, "buyer"),
        fee: readBigint(args.fee, "fee"),
        listingId: readBigint(args.listingId, "listingId"),
        price: readBigint(args.price, "price")
      };
    case "RedemptionRequested":
      return {
        ...evidence,
        kind: eventName,
        requestId: readBigint(args.requestId, "requestId"),
        requester: readAddress(args.requester, "requester"),
        tokenId: readBigint(args.tokenId, "tokenId")
      };
    case "RedemptionStatusUpdated":
      return {
        ...evidence,
        kind: eventName,
        previousStatus: readNumber(args.previousStatus, "previousStatus"),
        requestId: readBigint(args.requestId, "requestId"),
        status: readNumber(args.status, "status")
      };
    default:
      return null;
  }
}

export function eventPayload(event: ProtocolEvent): Record<string, string | number> {
  const entries = Object.entries(event).filter(([key]) => ![
    "blockHash",
    "blockNumber",
    "chainId",
    "contractAddress",
    "kind",
    "logIndex",
    "transactionHash"
  ].includes(key));
  return Object.fromEntries(entries.map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value]));
}

export const redemptionStatusName = (status: number): "requested" | "approved" | "packed" | "shipped" | "completed" | "cancelled" => {
  const statuses = ["requested", "approved", "packed", "shipped", "completed", "cancelled"] as const;
  const name = statuses[status];
  if (name === undefined) throw new Error(`Unsupported redemption status ${status}`);
  return name;
};

function readBigint(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") throw new Error(`Decoded ${label} is not a bigint`);
  return value;
}

function readNumber(value: unknown, label: string): number {
  if (typeof value !== "number") throw new Error(`Decoded ${label} is not a number`);
  return value;
}

function readAddress(value: unknown, label: string): Address {
  if (typeof value !== "string") throw new Error(`Decoded ${label} is not an address`);
  return getAddress(value);
}

function readHex(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !value.startsWith("0x")) throw new Error(`Decoded ${label} is not hex`);
  return value as Hex;
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Decoded ${label} is empty`);
  return value;
}
