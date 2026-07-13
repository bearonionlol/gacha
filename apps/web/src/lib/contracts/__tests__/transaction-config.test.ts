import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import {
  createPackRevealRequestForPurchase,
  createPackPurchaseRequest,
  createMarketListRequestForToken,
  createRedemptionAdminRequest,
  createRedemptionRequestForToken,
  extractPackPurchaseId,
  getPaidActionSafetyBlockReason,
  parseAllowlistProof,
  parsePositiveEthAmount,
  parsePositiveActionId,
  parsePositiveTokenId,
  resolveProtocolWriteConfig,
  testnetWriteConfig
} from "../transaction-config";
import { packSaleAbi } from "../abis";
import { resolveChainContext } from "../../deployments";

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
    expect(testnetWriteConfig.forge.recipeId).toBe(2n);
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

  it("parses ETH asks and explicit allowlist proofs without accepting malformed input", () => {
    const proof = `0x${"ab".repeat(32)}`;
    expect(parsePositiveEthAmount("0.015")).toBe(15_000_000_000_000_000n);
    expect(parsePositiveEthAmount("0")).toBeNull();
    expect(parseAllowlistProof(proof)).toEqual([proof]);
    expect(parseAllowlistProof("[]")).toEqual([]);
    expect(parseAllowlistProof("")).toBeNull();
    expect(parseAllowlistProof("0x1234")).toBeNull();
  });

  it("requires explicit mainnet drop configuration and production randomness metadata", () => {
    const config = resolveProtocolWriteConfig({
      NEXT_PUBLIC_GACHA_ALLOWLIST_PROOF: "[]",
      NEXT_PUBLIC_GACHA_DROP_ID: "7",
      NEXT_PUBLIC_GACHA_PACK_PRICE_WEI: "20000000000000000"
    });
    expect(config.pack.dropId).toBe(7n);
    expect(config.pack.dropIdIsExplicit).toBe(true);
    expect(config.pack.allowlistProofInput).toBe("[]");

    const unsafeMainnet = resolveChainContext({
      network: "robinhoodMainnet",
      chainId: 4663,
      randomnessProviderKind: "commit-reveal-demo",
      contracts: {}
    });
    const safeMainnet = resolveChainContext({
      network: "robinhoodMainnet",
      chainId: 4663,
      randomnessProviderKind: "pinned-coordinator",
      randomnessCoordinator: "0x0000000000000000000000000000000000001234",
      launchState: "active",
      roleHolders: {
        protocolAdmin: "0x0000000000000000000000000000000000000101",
        operations: "0x0000000000000000000000000000000000000102",
        guardian: "0x0000000000000000000000000000000000000103",
        treasury: "0x0000000000000000000000000000000000000104"
      },
      contracts: Object.fromEntries([
        "InventoryRegistry", "ItemToken", "CommitRevealRandomnessProvider", "PackSale", "Marketplace",
        "BuybackVault", "Forge", "RedemptionRegistry", "DustLedger", "DustRewardPolicy",
        "CollectibleForgePolicy", "TradeInVault", "TierPool", "VaultPassport", "VaultForge"
      ].map((name, index) => [name, `0x${(index + 1).toString(16).padStart(40, "0")}`]))
    });
    expect(getPaidActionSafetyBlockReason(unsafeMainnet)).toMatch(/pinned-coordinator/i);
    expect(getPaidActionSafetyBlockReason(safeMainnet)).toBeNull();
  });

  it("extracts the purchased pack ID from a confirmed receipt", () => {
    const buyer = "0x1234567890abcdef1234567890abcdef12345678" as Address;
    const requestId = `0x${"ab".repeat(32)}` as const;
    const topics = encodeEventTopics({
      abi: packSaleAbi,
      eventName: "PackPurchased",
      args: { purchaseId: 7n, dropId: 1n, buyer }
    });
    const data = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }],
      [requestId, 10_000_000_000_000_000n]
    );

    expect(extractPackPurchaseId({ logs: [{ data, topics: topics as readonly Hex[] }] })).toBe(7n);
    expect(extractPackPurchaseId({ logs: [] })).toBeNull();
  });

  it("does not build market or redemption writes without an owned token ID", () => {
    expect(createMarketListRequestForToken(contracts, null)).toBeNull();
    expect(createRedemptionRequestForToken(contracts, null)).toBeNull();
  });

  it("never falls back to a proofless public purchase for an allowlisted drop", () => {
    const allowlistRoot = `0x${"ab".repeat(32)}` as const;
    const publicRoot = `0x${"0".repeat(64)}` as const;
    const baseInput = { contracts, dropId: 1n, value: 10n };

    expect(createPackPurchaseRequest({ ...baseInput, allowlistRoot, allowlistProof: null })).toBeNull();
    expect(createPackPurchaseRequest({ ...baseInput, allowlistRoot, allowlistProof: [] })).toMatchObject({
      kind: "packPurchaseAllowlisted",
      allowlistProof: []
    });
    expect(createPackPurchaseRequest({ ...baseInput, allowlistRoot: publicRoot, allowlistProof: null })).toMatchObject({
      kind: "packPurchase"
    });
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
