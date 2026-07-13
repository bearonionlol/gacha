vi.mock("server-only", () => ({}));

import { requiredDeploymentContracts } from "../../deployments";
import { loadProtocolIndexerConfig } from "../config";

const contracts = Object.fromEntries(requiredDeploymentContracts.map((name, index) => [
  name,
  `0x${(index + 1).toString(16).padStart(40, "0")}`
]));
const registry = JSON.stringify({ chainId: 46630, contracts, network: "robinhoodTestnet" });

describe("loadProtocolIndexerConfig", () => {
  it("loads bounded finalized-indexer settings from the live registry", () => {
    const config = loadProtocolIndexerConfig({
      ADMIN_CHAIN_INDEXER_CONFIRMATIONS: "20",
      ADMIN_CHAIN_INDEXER_LOG_CHUNK_SIZE: "250",
      ADMIN_CHAIN_INDEXER_MAX_BLOCKS: "5000",
      ADMIN_CHAIN_INDEXER_START_BLOCK: "89940000",
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: registry
    });

    expect(config).toMatchObject({
      chainId: 46630,
      confirmationDepth: 20n,
      logChunkSize: 250n,
      maxBlocks: 5000n,
      startBlock: 89940000n
    });
    expect(config.streamKey).toContain(config.contracts.PackSale.toLowerCase());
  });

  it("refuses to guess a deployment start block", () => {
    expect(() => loadProtocolIndexerConfig({
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: registry
    })).toThrow("ADMIN_CHAIN_INDEXER_START_BLOCK is required");
  });
});
