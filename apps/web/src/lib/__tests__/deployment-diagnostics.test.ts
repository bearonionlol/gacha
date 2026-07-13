import { getDeploymentDiagnostics, loadChainContextFromEnv } from "../deployments";

const baseContracts = {
  InventoryRegistry: "0x0000000000000000000000000000000000000001",
  ItemToken: "0x0000000000000000000000000000000000000002",
  CommitRevealRandomnessProvider: "0x0000000000000000000000000000000000000003",
  PackSale: "0x0000000000000000000000000000000000000004",
  Marketplace: "0x0000000000000000000000000000000000000005",
  BuybackVault: "0x0000000000000000000000000000000000000006",
  Forge: "0x0000000000000000000000000000000000000007",
  RedemptionRegistry: "0x0000000000000000000000000000000000000008"
};

const vaultForgeContracts = {
  DustLedger: "0x0000000000000000000000000000000000000009",
  DustRewardPolicy: "0x000000000000000000000000000000000000000a",
  CollectibleForgePolicy: "0x000000000000000000000000000000000000000b",
  TradeInVault: "0x000000000000000000000000000000000000000c",
  TierPool: "0x000000000000000000000000000000000000000d",
  VaultPassport: "0x000000000000000000000000000000000000000e",
  VaultForge: "0x000000000000000000000000000000000000000f"
};

describe("deployment diagnostics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the default deployment from the public registry variable", () => {
    vi.stubEnv("NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY", JSON.stringify({
      network: "robinhoodTestnet",
      chainId: 46630,
      contracts: { ...baseContracts, ...vaultForgeContracts }
    }));

    const context = loadChainContextFromEnv();

    expect(context.mode).toBe("testnet");
    expect(context.environmentLabel).toBe("Testnet");
    expect(context.readiness).toBe("ready");
  });

  it("distinguishes a usable base deployment from a missing Vault Forge deployment", () => {
    const result = getDeploymentDiagnostics({
      network: "robinhoodTestnet",
      chainId: 46630,
      timestamp: "2026-07-09T00:00:00.000Z",
      contracts: baseContracts
    });

    expect(result.baseReady).toBe(true);
    expect(result.baseReadyCount).toBe(8);
    expect(result.vaultForgeReady).toBe(false);
    expect(result.vaultForgeReadyCount).toBe(0);
    expect(result.fullStackReady).toBe(false);
    expect(result.timestamp).toBe("2026-07-09T00:00:00.000Z");
  });

  it("marks the complete 15-contract registry ready", () => {
    const result = getDeploymentDiagnostics({
      network: "robinhoodTestnet",
      chainId: 46630,
      contracts: { ...baseContracts, ...vaultForgeContracts }
    });

    expect(result.totalReadyCount).toBe(15);
    expect(result.fullStackReady).toBe(true);
    expect(result.contracts.every((contract) => contract.status === "ready")).toBe(true);
  });

  it("does not mark a complete mainnet registry ready for public testnet", () => {
    const result = getDeploymentDiagnostics({
      network: "robinhoodMainnet",
      chainId: 4663,
      contracts: { ...baseContracts, ...vaultForgeContracts }
    });

    expect(result.totalReadyCount).toBe(15);
    expect(result.targetChainReady).toBe(false);
    expect(result.baseReady).toBe(false);
    expect(result.vaultForgeReady).toBe(false);
    expect(result.fullStackReady).toBe(false);
  });

  it("reports malformed addresses separately from missing contracts", () => {
    const result = getDeploymentDiagnostics({
      network: "robinhoodTestnet",
      chainId: 46630,
      contracts: { ...baseContracts, ItemToken: "invalid" }
    });

    expect(result.contracts.find((contract) => contract.name === "ItemToken")?.status).toBe("invalid");
    expect(result.contracts.find((contract) => contract.name === "VaultForge")?.status).toBe("missing");
  });

  it("rejects zero and reused contract addresses", () => {
    const result = getDeploymentDiagnostics({
      network: "robinhoodTestnet",
      chainId: 46630,
      contracts: {
        ...baseContracts,
        ItemToken: "0x0000000000000000000000000000000000000000",
        PackSale: baseContracts.Marketplace
      }
    });

    expect(result.contracts.find((contract) => contract.name === "ItemToken")?.status).toBe("invalid");
    expect(result.contracts.find((contract) => contract.name === "PackSale")?.status).toBe("duplicate");
    expect(result.contracts.find((contract) => contract.name === "Marketplace")?.status).toBe("duplicate");
    expect(result.baseReady).toBe(false);
  });
});
