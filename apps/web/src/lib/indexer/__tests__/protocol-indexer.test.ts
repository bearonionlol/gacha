import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";

import type { ProtocolContracts } from "../../contracts/registry";
import { protocolEventAbi, type ProtocolEvent, type ProtocolLog } from "../protocol-events";
import {
  runProtocolIndexer,
  type ProtocolIndexerConfig,
  type ProtocolIndexerEventStore,
  type ProtocolInventoryReconciler,
  type ProtocolLogSource
} from "../protocol-indexer";

const contracts = {
  PackSale: "0x1111111111111111111111111111111111111111",
  Marketplace: "0x2222222222222222222222222222222222222222",
  RedemptionRegistry: "0x3333333333333333333333333333333333333333"
} satisfies Pick<ProtocolContracts, "PackSale" | "Marketplace" | "RedemptionRegistry">;
const buyer = "0x4444444444444444444444444444444444444444" as Address;
const requestId = `0x${"c".repeat(64)}` as Hex;
const config: ProtocolIndexerConfig = {
  chainId: 46630,
  confirmationDepth: 2n,
  contracts,
  logChunkSize: 20n,
  maxBlocks: 100n,
  startBlock: 100n,
  streamKey: "test-stream"
};

describe("runProtocolIndexer", () => {
  it("orders finalized logs, reconciles inventory, and checkpoints the completed chunk", async () => {
    const purchase = packPurchasedLog(101n, 4);
    const reveal = packRevealedLog(102n, 2);
    const source: ProtocolLogSource = {
      getBlockNumber: vi.fn().mockResolvedValue(115n),
      getLogs: vi.fn().mockResolvedValue([reveal, purchase])
    };
    const staged: string[] = [];
    const checkpoints: bigint[] = [];
    const store = createStore({
      setCheckpoint: async (_chainId, _streamKey, nextBlock) => { checkpoints.push(nextBlock); },
      stage: async (event) => {
        staged.push(event.kind);
        return event.kind === "PackRevealed"
          ? {
              chainEvidence: {
                blockNumber: event.blockNumber.toString(),
                chainId: event.chainId,
                contractAddress: event.contractAddress,
                eventName: event.kind,
                logIndex: event.logIndex,
                transactionHash: event.transactionHash
              },
              inventoryId: event.inventoryId,
              targetStatus: "user_owned"
            }
          : null;
      }
    });
    const inventory: ProtocolInventoryReconciler = { reconcileOnchainStatus: vi.fn().mockResolvedValue({}) };

    const result = await runProtocolIndexer(source, store, inventory, config);

    expect(staged).toEqual(["PackPurchased", "PackRevealed"]);
    expect(inventory.reconcileOnchainStatus).toHaveBeenCalledWith(
      "inv-op06-case-001",
      "user_owned",
      expect.objectContaining({ role: "chain_indexer" }),
      expect.objectContaining({ eventName: "PackRevealed" })
    );
    expect(checkpoints).toEqual([114n]);
    expect(result).toMatchObject({ complete: true, decodedEvents: 2, nextBlock: "114", reconciledInventoryEvents: 1 });
  });

  it("does not advance the checkpoint when inventory reconciliation fails", async () => {
    const source: ProtocolLogSource = {
      getBlockNumber: vi.fn().mockResolvedValue(115n),
      getLogs: vi.fn().mockResolvedValue([packRevealedLog(102n, 2)])
    };
    const setCheckpoint = vi.fn();
    const markReconciled = vi.fn();
    const store = createStore({
      markReconciled,
      setCheckpoint,
      stage: async (event) => ({
        chainEvidence: {
          blockNumber: event.blockNumber.toString(),
          chainId: event.chainId,
          contractAddress: event.contractAddress,
          eventName: event.kind,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash
        },
        inventoryId: "inv-op06-case-001",
        targetStatus: "user_owned"
      })
    });
    const inventory: ProtocolInventoryReconciler = {
      reconcileOnchainStatus: vi.fn().mockRejectedValue(new Error("revision conflict"))
    };

    await expect(runProtocolIndexer(source, store, inventory, config)).rejects.toThrow("revision conflict");
    expect(markReconciled).not.toHaveBeenCalled();
    expect(setCheckpoint).not.toHaveBeenCalled();
  });
});

function createStore(overrides: Partial<ProtocolIndexerEventStore>): ProtocolIndexerEventStore {
  return {
    getCheckpoint: vi.fn().mockResolvedValue(null),
    markReconciled: vi.fn().mockResolvedValue(undefined),
    setCheckpoint: vi.fn().mockResolvedValue(undefined),
    stage: vi.fn().mockResolvedValue(null),
    ...overrides
  };
}

function packPurchasedLog(blockNumber: bigint, logIndex: number): ProtocolLog {
  return {
    address: contracts.PackSale,
    blockHash: blockHash(blockNumber),
    blockNumber,
    data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [requestId, 1n]),
    logIndex,
    topics: encodeEventTopics({
      abi: protocolEventAbi,
      eventName: "PackPurchased",
      args: { buyer, dropId: 2n, purchaseId: 2n }
    }) as readonly Hex[],
    transactionHash: transactionHash(blockNumber)
  };
}

function packRevealedLog(blockNumber: bigint, logIndex: number): ProtocolLog {
  return {
    address: contracts.PackSale,
    blockHash: blockHash(blockNumber),
    blockNumber,
    data: encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }],
      ["inv-op06-case-001", 123n]
    ),
    logIndex,
    topics: encodeEventTopics({
      abi: protocolEventAbi,
      eventName: "PackRevealed",
      args: { buyer, dropId: 2n, purchaseId: 2n }
    }) as readonly Hex[],
    transactionHash: transactionHash(blockNumber)
  };
}

function blockHash(blockNumber: bigint): Hex {
  return `0x${blockNumber.toString(16).padStart(64, "0")}` as Hex;
}

function transactionHash(blockNumber: bigint): Hex {
  return `0x${(blockNumber + 1_000n).toString(16).padStart(64, "0")}` as Hex;
}
