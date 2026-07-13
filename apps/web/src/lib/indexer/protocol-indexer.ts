import type { InventoryActor, InventoryChainEvidence, InventoryStatus } from "@gacha/inventory";
import type { Address } from "viem";

import type { ProtocolContracts } from "../contracts/registry";
import { decodeProtocolEvent, type ProtocolEvent, type ProtocolLog } from "./protocol-events";

export type ProtocolLogSource = {
  getBlockNumber(): Promise<bigint>;
  getLogs(request: {
    address: readonly Address[];
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<readonly ProtocolLog[]>;
};

export type ProtocolIndexerEventStore = {
  getCheckpoint(chainId: number, streamKey: string): Promise<bigint | null>;
  markReconciled(event: ProtocolEvent): Promise<void>;
  setCheckpoint(chainId: number, streamKey: string, nextBlock: bigint): Promise<void>;
  stage(event: ProtocolEvent): Promise<{
    chainEvidence: InventoryChainEvidence;
    inventoryId: string;
    targetStatus: InventoryStatus;
  } | null>;
};

export type ProtocolInventoryReconciler = {
  reconcileOnchainStatus(
    inventoryId: string,
    targetStatus: InventoryStatus,
    actor: InventoryActor,
    chainEvidence: InventoryChainEvidence
  ): Promise<unknown>;
};

export type ProtocolIndexerConfig = {
  chainId: number;
  confirmationDepth: bigint;
  contracts: Pick<ProtocolContracts, "PackSale" | "Marketplace" | "RedemptionRegistry">;
  logChunkSize: bigint;
  maxBlocks: bigint;
  startBlock: bigint;
  streamKey: string;
};

export type ProtocolIndexerResult = {
  complete: boolean;
  decodedEvents: number;
  finalizedBlock: string;
  latestBlock: string;
  logsSeen: number;
  nextBlock: string;
  reconciledInventoryEvents: number;
  scannedFromBlock: string | null;
  scannedToBlock: string | null;
};

export async function runProtocolIndexer(
  source: ProtocolLogSource,
  store: ProtocolIndexerEventStore,
  inventory: ProtocolInventoryReconciler,
  config: ProtocolIndexerConfig
): Promise<ProtocolIndexerResult> {
  assertConfig(config);
  const latestBlock = await source.getBlockNumber();
  const finalizedBlock = latestBlock > config.confirmationDepth
    ? latestBlock - config.confirmationDepth
    : 0n;
  const checkpoint = await store.getCheckpoint(config.chainId, config.streamKey);
  let nextBlock = checkpoint ?? config.startBlock;
  const scannedFromBlock = nextBlock <= finalizedBlock ? nextBlock : null;
  const maximumToBlock = nextBlock + config.maxBlocks - 1n;
  const scanToBlock = minBigint(finalizedBlock, maximumToBlock);
  let decodedEvents = 0;
  let logsSeen = 0;
  let reconciledInventoryEvents = 0;
  let scannedToBlock: bigint | null = null;

  while (nextBlock <= scanToBlock) {
    const chunkToBlock = minBigint(scanToBlock, nextBlock + config.logChunkSize - 1n);
    const logs = [...await source.getLogs({
      address: [config.contracts.PackSale, config.contracts.Marketplace, config.contracts.RedemptionRegistry],
      fromBlock: nextBlock,
      toBlock: chunkToBlock
    })].sort(compareLogs);
    logsSeen += logs.length;

    for (const log of logs) {
      const event = decodeProtocolEvent(log, config.contracts, config.chainId);
      if (event === null) continue;
      decodedEvents += 1;
      const action = await store.stage(event);
      if (action !== null) {
        await inventory.reconcileOnchainStatus(
          action.inventoryId,
          action.targetStatus,
          indexerActor(event),
          action.chainEvidence
        );
        reconciledInventoryEvents += 1;
      }
      await store.markReconciled(event);
    }

    nextBlock = chunkToBlock + 1n;
    scannedToBlock = chunkToBlock;
    await store.setCheckpoint(config.chainId, config.streamKey, nextBlock);
  }

  return {
    complete: nextBlock > finalizedBlock,
    decodedEvents,
    finalizedBlock: finalizedBlock.toString(),
    latestBlock: latestBlock.toString(),
    logsSeen,
    nextBlock: nextBlock.toString(),
    reconciledInventoryEvents,
    scannedFromBlock: scannedFromBlock?.toString() ?? null,
    scannedToBlock: scannedToBlock?.toString() ?? null
  };
}

function assertConfig(config: ProtocolIndexerConfig): void {
  if (!Number.isSafeInteger(config.chainId) || config.chainId < 1) throw new Error("Indexer chain ID is invalid");
  if (config.confirmationDepth < 0n) throw new Error("Indexer confirmation depth cannot be negative");
  if (config.logChunkSize < 1n) throw new Error("Indexer log chunk size must be positive");
  if (config.maxBlocks < 1n) throw new Error("Indexer block budget must be positive");
  if (config.startBlock < 0n) throw new Error("Indexer start block cannot be negative");
}

function compareLogs(left: ProtocolLog, right: ProtocolLog): number {
  const blockComparison = compareNullableBigint(left.blockNumber, right.blockNumber);
  if (blockComparison !== 0) return blockComparison;
  return (left.logIndex ?? Number.MAX_SAFE_INTEGER) - (right.logIndex ?? Number.MAX_SAFE_INTEGER);
}

function compareNullableBigint(left: bigint | null, right: bigint | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

function indexerActor(event: ProtocolEvent): InventoryActor {
  return {
    requestId: `chain:${event.chainId}:${event.transactionHash}:${event.logIndex}`,
    role: "chain_indexer",
    walletAddress: "0x0000000000000000000000000000000000000000"
  };
}

function minBigint(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
