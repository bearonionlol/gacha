import { describe, expect, it } from "vitest";
import { getLiveProtocolSnapshot, type ProtocolReadClient } from "../live-state";

const addresses = {
  InventoryRegistry: "0x32657A9d0AFe229E132dA8610a23D6d32d22C4Ee",
  ItemToken: "0x78Cb0aE303a90719F41383E2040D06BBedB2d26d",
  CommitRevealRandomnessProvider: "0xBcD78FfB562cFAeae978Ba38496f042Da6eeB113",
  PackSale: "0x363074770a98a3f8c258148678aFd095c4E5C0Ba",
  Marketplace: "0x2d4Cfd663DDAef48ae4659c09068E842FC31423C",
  BuybackVault: "0x78d0d7C799A6D44085cb4372F1FF6BA49eD224b0",
  Forge: "0x26F77058552b9E69e7d1EE6AADeFeD4BbF555B4B",
  RedemptionRegistry: "0x36C37cb08c78E50a87BB705D6F06EBae11C07451"
};

const registry = {
  network: "robinhoodTestnet",
  chainId: 46630,
  contracts: addresses
};

const mainnetRegistry = {
  network: "robinhoodMainnet",
  chainId: 4663,
  contracts: addresses
};

describe("live protocol state", () => {
  it("returns demo state without a ready registry", async () => {
    const snapshot = await getLiveProtocolSnapshot({ registrySnapshot: null });

    expect(snapshot.state).toBe("demo");
    expect(snapshot.metrics).toHaveLength(0);
  });

  it("returns ready metrics from a read client", async () => {
    const client: ProtocolReadClient = {
      readContract: async ({ functionName }) => {
        const values: Record<string, bigint> = {
          nextDropId: 2n,
          nextPurchaseId: 1n,
          treasuryCredit: 0n,
          remainingInventory: 3n,
          nextListingId: 1n,
          feeBps: 250n,
          nextRecipeId: 3n,
          nextRequestId: 1n
        };

        return values[String(functionName)] ?? 0n;
      }
    };

    const snapshot = await getLiveProtocolSnapshot({ registrySnapshot: registry, client });

    expect(snapshot.state).toBe("ready");
    expect(snapshot.metrics.map((metric) => metric.label)).toContain("Drops created");
    expect(snapshot.metrics.find((metric) => metric.label === "Market fee")?.value).toBe("250 bps");
  });

  it("returns degraded state when an RPC read fails", async () => {
    const client: ProtocolReadClient = {
      readContract: async () => {
        throw new Error("rpc unavailable at https://secret.example/rpc");
      }
    };

    const snapshot = await getLiveProtocolSnapshot({ registrySnapshot: registry, client });

    expect(snapshot.state).toBe("degraded");
    expect(snapshot.message).toBe("Robinhood testnet RPC is temporarily unavailable. Browsing remains in read-only mode.");
    expect(snapshot.message).not.toContain("https://secret.example");
  });

  it("does not read mainnet registries during the Phase 4A testnet slice", async () => {
    const client: ProtocolReadClient = {
      readContract: async () => {
        throw new Error("mainnet should not be read");
      }
    };

    const snapshot = await getLiveProtocolSnapshot({ registrySnapshot: mainnetRegistry, client });

    expect(snapshot.state).toBe("demo");
    expect(snapshot.message).toMatch(/testnet only/i);
  });
});
