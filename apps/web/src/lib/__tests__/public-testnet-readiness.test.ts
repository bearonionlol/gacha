import { getPublicTestnetReadiness } from "../public-testnet-readiness";

const readyRegistry = JSON.stringify({
  network: "robinhoodTestnet",
  chainId: 46630,
  timestamp: "2026-07-09T00:00:00.000Z",
  contracts: {
    InventoryRegistry: "0x0000000000000000000000000000000000000001",
    ItemToken: "0x0000000000000000000000000000000000000002",
    CommitRevealRandomnessProvider: "0x0000000000000000000000000000000000000003",
    PackSale: "0x0000000000000000000000000000000000000004",
    Marketplace: "0x0000000000000000000000000000000000000005",
    BuybackVault: "0x0000000000000000000000000000000000000006",
    Forge: "0x0000000000000000000000000000000000000007",
    RedemptionRegistry: "0x0000000000000000000000000000000000000008",
    DustLedger: "0x0000000000000000000000000000000000000009",
    DustRewardPolicy: "0x000000000000000000000000000000000000000a",
    CollectibleForgePolicy: "0x000000000000000000000000000000000000000b",
    TradeInVault: "0x000000000000000000000000000000000000000c",
    TierPool: "0x000000000000000000000000000000000000000d",
    VaultPassport: "0x000000000000000000000000000000000000000e",
    VaultForge: "0x000000000000000000000000000000000000000f"
  }
});

describe("public testnet readiness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads its default checks from statically named public variables", () => {
    vi.stubEnv("NEXT_PUBLIC_GACHA_CHAIN_MODE", "testnet");
    vi.stubEnv("NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY", readyRegistry);
    vi.stubEnv("NEXT_PUBLIC_GACHA_ENABLE_ADMIN", "true");
    vi.stubEnv("NEXT_PUBLIC_GACHA_RPC_URL", "https://rpc.testnet.chain.robinhood.com");

    expect(getPublicTestnetReadiness().summary).toBe("ready");
  });

  it("marks a fully configured Robinhood testnet build ready", () => {
    const readiness = getPublicTestnetReadiness({
      NEXT_PUBLIC_GACHA_CHAIN_MODE: "testnet",
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: readyRegistry,
      NEXT_PUBLIC_GACHA_ENABLE_ADMIN: "true",
      NEXT_PUBLIC_GACHA_RPC_URL: "https://robinhood-testnet.g.alchemy.com/v2/example"
    });

    expect(readiness.summary).toBe("ready");
    expect(readiness.blockingCount).toBe(0);
    expect(readiness.reviewCount).toBe(0);
    expect(readiness.checks.map((check) => check.label)).toContain("Deployment registry");
  });

  it("blocks public launch when the registry is missing", () => {
    const readiness = getPublicTestnetReadiness({
      NEXT_PUBLIC_GACHA_CHAIN_MODE: "testnet",
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: "demo",
      NEXT_PUBLIC_GACHA_ENABLE_ADMIN: "true",
      NEXT_PUBLIC_GACHA_RPC_URL: "https://robinhood-testnet.g.alchemy.com/v2/example"
    });

    expect(readiness.summary).toBe("blocked");
    expect(readiness.checks.find((check) => check.id === "deployment-registry")?.status).toBe("fail");
  });

  it("blocks public launch when a Vault Forge V4 address is missing", () => {
    const parsed = JSON.parse(readyRegistry) as { contracts: Record<string, string> };
    delete parsed.contracts.TierPool;
    const readiness = getPublicTestnetReadiness({
      NEXT_PUBLIC_GACHA_CHAIN_MODE: "testnet",
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: JSON.stringify(parsed),
      NEXT_PUBLIC_GACHA_ENABLE_ADMIN: "true",
      NEXT_PUBLIC_GACHA_RPC_URL: "https://robinhood-testnet.g.alchemy.com/v2/example"
    });

    expect(readiness.summary).toBe("blocked");
    expect(readiness.checks.find((check) => check.id === "deployment-registry")?.detail).toMatch(/TierPool/);
  });

  it("blocks public testnet launch when a mainnet registry is supplied", () => {
    const readiness = getPublicTestnetReadiness({
      NEXT_PUBLIC_GACHA_CHAIN_MODE: "testnet",
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: readyRegistry.replace("46630", "4663"),
      NEXT_PUBLIC_GACHA_ENABLE_ADMIN: "true",
      NEXT_PUBLIC_GACHA_RPC_URL: "https://robinhood-testnet.g.alchemy.com/v2/example"
    });

    expect(readiness.summary).toBe("blocked");
    expect(readiness.checks.find((check) => check.id === "deployment-registry")?.detail).toMatch(/testnet/i);
  });

  it("requires review when admin tools are hidden for an operator rehearsal", () => {
    const readiness = getPublicTestnetReadiness({
      NEXT_PUBLIC_GACHA_CHAIN_MODE: "testnet",
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: readyRegistry,
      NEXT_PUBLIC_GACHA_ENABLE_ADMIN: "false",
      NEXT_PUBLIC_GACHA_RPC_URL: "https://robinhood-testnet.g.alchemy.com/v2/example"
    });

    expect(readiness.summary).toBe("needs_review");
    expect(readiness.checks.find((check) => check.id === "operator-controls")?.status).toBe("warn");
  });
});
