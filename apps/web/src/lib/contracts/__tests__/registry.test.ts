import { describe, expect, it } from "vitest";
import { getReadyContractRegistry } from "../registry";

const completeRegistry = {
  network: "robinhoodTestnet",
  chainId: 46630,
  timestamp: "2026-07-09T15:03:54.201Z",
  contracts: {
    InventoryRegistry: "0x32657A9d0AFe229E132dA8610a23D6d32d22C4Ee",
    ItemToken: "0x78Cb0aE303a90719F41383E2040D06BBedB2d26d",
    CommitRevealRandomnessProvider: "0xBcD78FfB562cFAeae978Ba38496f042Da6eeB113",
    PackSale: "0x363074770a98a3f8c258148678aFd095c4E5C0Ba",
    Marketplace: "0x2d4Cfd663DDAef48ae4659c09068E842FC31423C",
    BuybackVault: "0x78d0d7C799A6D44085cb4372F1FF6BA49eD224b0",
    Forge: "0x26F77058552b9E69e7d1EE6AADeFeD4BbF555B4B",
    RedemptionRegistry: "0x36C37cb08c78E50a87BB705D6F06EBae11C07451"
  }
};

describe("contract registry helpers", () => {
  it("returns typed addresses for a ready Robinhood testnet registry", () => {
    const registry = getReadyContractRegistry(completeRegistry);

    expect(registry.status.readiness).toBe("ready");
    expect(registry.contracts?.PackSale).toBe(completeRegistry.contracts.PackSale);
    expect(registry.chainId).toBe(46630);
  });

  it("keeps contracts unavailable when registry is missing", () => {
    const registry = getReadyContractRegistry(null);

    expect(registry.status.readiness).toBe("demo");
    expect(registry.contracts).toBe(null);
  });
});
