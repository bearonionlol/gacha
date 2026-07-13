import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";

import type { ProtocolContracts } from "../../contracts/registry";
import { decodeProtocolEvent, protocolEventAbi, type ProtocolLog } from "../protocol-events";

const contracts = {
  PackSale: "0x1111111111111111111111111111111111111111",
  Marketplace: "0x2222222222222222222222222222222222222222",
  RedemptionRegistry: "0x3333333333333333333333333333333333333333"
} satisfies Pick<ProtocolContracts, "PackSale" | "Marketplace" | "RedemptionRegistry">;
const buyer = "0x4444444444444444444444444444444444444444" as Address;
const blockHash = `0x${"a".repeat(64)}` as Hex;
const transactionHash = `0x${"b".repeat(64)}` as Hex;
const requestId = `0x${"c".repeat(64)}` as Hex;

describe("decodeProtocolEvent", () => {
  it("decodes a finalized PackPurchased log into normalized protocol data", () => {
    const topics = encodeEventTopics({
      abi: protocolEventAbi,
      eventName: "PackPurchased",
      args: { buyer, dropId: 2n, purchaseId: 7n }
    });
    const data = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }],
      [requestId, 10_000_000_000_000_000n]
    );

    expect(decodeProtocolEvent(log({ address: contracts.PackSale, data, topics: topics as readonly Hex[] }), contracts, 46630)).toEqual({
      blockHash,
      blockNumber: 101n,
      buyer,
      chainId: 46630,
      contractAddress: contracts.PackSale,
      dropId: 2n,
      kind: "PackPurchased",
      logIndex: 3,
      price: 10_000_000_000_000_000n,
      purchaseId: 7n,
      requestId,
      transactionHash
    });
  });

  it("ignores a known event emitted from the wrong protocol contract", () => {
    const topics = encodeEventTopics({
      abi: protocolEventAbi,
      eventName: "PackPurchased",
      args: { buyer, dropId: 2n, purchaseId: 7n }
    });
    const data = encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [requestId, 1n]);

    expect(decodeProtocolEvent(log({ address: contracts.Marketplace, data, topics: topics as readonly Hex[] }), contracts, 46630)).toBeNull();
  });

  it("does not index logs without finalized block evidence", () => {
    const topics = encodeEventTopics({
      abi: protocolEventAbi,
      eventName: "PackPurchased",
      args: { buyer, dropId: 2n, purchaseId: 7n }
    });
    const data = encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [requestId, 1n]);

    expect(decodeProtocolEvent({ ...log({ address: contracts.PackSale, data, topics: topics as readonly Hex[] }), blockHash: null }, contracts, 46630)).toBeNull();
  });
});

function log(input: { address: Address; data: Hex; topics: readonly Hex[] }): ProtocolLog {
  return {
    ...input,
    blockHash,
    blockNumber: 101n,
    logIndex: 3,
    transactionHash
  };
}
