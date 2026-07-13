import "server-only";

import type { AdminRuntime } from "../admin/runtime";
import { createConfiguredPublicClient } from "../contracts/transactions";
import { loadProtocolIndexerConfig } from "./config";
import { PostgresProtocolEventStore } from "./postgres-event-store";
import { runProtocolIndexer, type ProtocolLogSource } from "./protocol-indexer";

export async function runConfiguredProtocolIndexer(runtime: AdminRuntime) {
  const config = loadProtocolIndexerConfig();
  const client = createConfiguredPublicClient(config.chainContext);
  const source: ProtocolLogSource = {
    getBlockNumber: () => client.getBlockNumber(),
    getLogs: async ({ address, fromBlock, toBlock }) => {
      const logs = await client.getLogs({ address: [...address], fromBlock, toBlock });
      return logs.map((log) => ({
        address: log.address,
        blockHash: log.blockHash,
        blockNumber: log.blockNumber,
        data: log.data,
        logIndex: log.logIndex,
        topics: log.topics,
        transactionHash: log.transactionHash
      }));
    }
  };
  const store = new PostgresProtocolEventStore(runtime.database);
  return store.withStreamLock(config.chainId, config.streamKey, () => (
    runProtocolIndexer(source, store, runtime.inventory, config)
  ));
}
