import "server-only";

import {
  loadDeploymentRegistrySnapshotFromEnv,
  resolveChainContext,
  type ChainContext
} from "../deployments";
import { getReadyContractRegistry, type ProtocolContracts } from "../contracts/registry";
import type { ProtocolIndexerConfig } from "./protocol-indexer";

type IndexerEnvironment = Record<string, string | undefined>;

export type ConfiguredProtocolIndexer = ProtocolIndexerConfig & {
  chainContext: ChainContext;
  contracts: ProtocolContracts;
};

export function loadProtocolIndexerConfig(env: IndexerEnvironment = process.env): ConfiguredProtocolIndexer {
  const snapshot = loadDeploymentRegistrySnapshotFromEnv({
    NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY
  });
  const registry = getReadyContractRegistry(snapshot);
  const chainContext = resolveChainContext(snapshot);
  if (registry.contracts === null || chainContext.isDemo) {
    throw new Error("Protocol indexer requires a complete live deployment registry");
  }

  const startBlock = parseBigintSetting(env.ADMIN_CHAIN_INDEXER_START_BLOCK, "ADMIN_CHAIN_INDEXER_START_BLOCK", {
    minimum: 0n,
    required: true
  });
  const confirmationDepth = parseBigintSetting(
    env.ADMIN_CHAIN_INDEXER_CONFIRMATIONS,
    "ADMIN_CHAIN_INDEXER_CONFIRMATIONS",
    { defaultValue: 12n, maximum: 10_000n, minimum: 0n }
  );
  const logChunkSize = parseBigintSetting(
    env.ADMIN_CHAIN_INDEXER_LOG_CHUNK_SIZE,
    "ADMIN_CHAIN_INDEXER_LOG_CHUNK_SIZE",
    { defaultValue: 1_000n, maximum: 10_000n, minimum: 1n }
  );
  const maxBlocks = parseBigintSetting(
    env.ADMIN_CHAIN_INDEXER_MAX_BLOCKS,
    "ADMIN_CHAIN_INDEXER_MAX_BLOCKS",
    { defaultValue: 100_000n, maximum: 1_000_000n, minimum: 1n }
  );
  const streamKey = [
    "protocol-v1",
    registry.contracts.PackSale,
    registry.contracts.Marketplace,
    registry.contracts.RedemptionRegistry
  ].map((value) => value.toLowerCase()).join(":");

  return {
    chainContext,
    chainId: registry.chainId,
    confirmationDepth,
    contracts: registry.contracts,
    logChunkSize,
    maxBlocks,
    startBlock,
    streamKey
  };
}

function parseBigintSetting(
  raw: string | undefined,
  name: string,
  constraints: {
    defaultValue?: bigint;
    maximum?: bigint;
    minimum: bigint;
    required?: boolean;
  }
): bigint {
  const value = raw?.trim();
  if (value === undefined || value === "") {
    if (constraints.required === true) throw new Error(`${name} is required`);
    if (constraints.defaultValue !== undefined) return constraints.defaultValue;
    throw new Error(`${name} is required`);
  }
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a base-10 integer`);
  const parsed = BigInt(value);
  if (parsed < constraints.minimum || (constraints.maximum !== undefined && parsed > constraints.maximum)) {
    throw new Error(`${name} is outside the supported range`);
  }
  return parsed;
}
