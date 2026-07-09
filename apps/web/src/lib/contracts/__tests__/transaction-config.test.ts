import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  createPackRevealRequestForPurchase,
  createMarketListRequestForToken,
  createRedemptionAdminRequest,
  createRedemptionRequestForToken,
  parsePositiveActionId,
  parsePositiveTokenId,
  testnetWriteConfig
} from "../transaction-config";

const contracts = {
  InventoryRegistry: "0x32657A9d0AFe229E132dA8610a23D6d32d22C4Ee" as Address,
  ItemToken: "0x78Cb0aE303a90719F41383E2040D06BBedB2d26d" as Address,
  CommitRevealRandomnessProvider: "0xBcD78FfB562cFAeae978Ba38496f042Da6eeB113" as Address,
  PackSale: "0x363074770a98a3f8c258148678aFd095c4E5C0Ba" as Address,
  Marketplace: "0x2d4Cfd663DDAef48ae4659c09068E842FC31423C" as Address,
  BuybackVault: "0x78d0d7C799A6D44085cb4372F1FF6BA49eD224b0" as Address,
  Forge: "0x26F77058552b9E69e7d1EE6AADeFeD4BbF555B4B" as Address,
  RedemptionRegistry: "0x36C37cb08c78E50a87BB705D6F06EBae11C07451" as Address
};

describe("transaction config", () => {
  it("uses exact seeded pack and Forge payment values", () => {
    expect(testnetWriteConfig.pack.value).toBe(10_000_000_000_000_000n);
    expect(testnetWriteConfig.pack.displayValue).toBe("0.01 ETH");
    expect(testnetWriteConfig.forge.value).toBe(1_000_000_000_000_000n);
    expect(testnetWriteConfig.forge.displayValue).toBe("0.001 ETH");
  });

  it("parses only positive numeric token IDs", () => {
    expect(parsePositiveTokenId("1001")).toBe(1001n);
    expect(parsePositiveTokenId(" 1001 ")).toBe(1001n);
    expect(parsePositiveTokenId("0")).toBeNull();
    expect(parsePositiveTokenId("")).toBeNull();
    expect(parsePositiveTokenId("abc")).toBeNull();
  });

  it("parses positive action IDs for purchase and redemption operations", () => {
    expect(parsePositiveActionId("12")).toBe(12n);
    expect(parsePositiveActionId(" 12 ")).toBe(12n);
    expect(parsePositiveActionId("0")).toBeNull();
    expect(parsePositiveActionId("")).toBeNull();
    expect(parsePositiveActionId("abc")).toBeNull();
  });

  it("does not build market or redemption writes without an owned token ID", () => {
    expect(createMarketListRequestForToken(contracts, null)).toBeNull();
    expect(createRedemptionRequestForToken(contracts, null)).toBeNull();
  });

  it("builds token-scoped market and redemption requests", () => {
    expect(createMarketListRequestForToken(contracts, 1001n)).toEqual({
      kind: "marketList",
      contracts,
      tokenId: 1001n,
      amount: testnetWriteConfig.market.amount,
      price: testnetWriteConfig.market.price
    });
    expect(createRedemptionRequestForToken(contracts, 2002n)).toEqual({
      kind: "redemptionRequest",
      contracts,
      tokenId: 2002n
    });
  });

  it("builds null-safe pack reveal and redemption admin requests", () => {
    expect(createPackRevealRequestForPurchase(contracts, null)).toBeNull();
    expect(createPackRevealRequestForPurchase(contracts, 7n)).toEqual({
      kind: "packReveal",
      contracts,
      purchaseId: 7n
    });

    expect(
      createRedemptionAdminRequest(contracts, {
        mode: "markShipped",
        requestId: 3n,
        trackingRef: "UPS-TEST-1",
        reason: ""
      })
    ).toEqual({
      kind: "redemptionMarkShipped",
      contracts,
      requestId: 3n,
      trackingRef: "UPS-TEST-1"
    });

    expect(
      createRedemptionAdminRequest(contracts, {
        mode: "cancel",
        requestId: 4n,
        trackingRef: "",
        reason: "testnet operator cancellation"
      })
    ).toEqual({
      kind: "redemptionCancel",
      contracts,
      requestId: 4n,
      reason: "testnet operator cancellation"
    });
  });
});
