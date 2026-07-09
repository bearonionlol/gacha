import { describe, expect, it, vi } from "vitest";
import type { Address, Hash } from "viem";
import {
  buildExplorerTxUrl,
  createWriteRequest,
  formatTransactionHash,
  getTransactionErrorMessage,
  waitForTransactionReceipt
} from "../transactions";
import { robinhoodTestnetChainId } from "../wallet";

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

describe("transaction helpers", () => {
  it("builds a pack purchase request with value", () => {
    const request = createWriteRequest({
      kind: "packPurchase",
      contracts,
      dropId: 1n,
      value: 10_000_000_000_000_000n
    });

    expect(request.address).toBe(contracts.PackSale);
    expect(request.functionName).toBe("purchase");
    expect(request.args).toEqual([1n]);
    expect(request.value).toBe(10_000_000_000_000_000n);
  });

  it("builds marketplace approval and list requests", () => {
    expect(
      createWriteRequest({
        kind: "approval",
        contracts,
        operator: "Marketplace",
        approved: true
      }).args
    ).toEqual([contracts.Marketplace, true]);

    const list = createWriteRequest({
      kind: "marketList",
      contracts,
      tokenId: 1001n,
      amount: 1n,
      price: 15_000_000_000_000_000n
    });

    expect(list.address).toBe(contracts.Marketplace);
    expect(list.functionName).toBe("list");
    expect(list.args).toEqual([1001n, 1n, 15_000_000_000_000_000n]);
  });

  it("builds marketplace buy, cancel, and proceeds requests", () => {
    const buy = createWriteRequest({
      kind: "marketBuy",
      contracts,
      listingId: 7n,
      value: 15_000_000_000_000_000n
    });
    const cancel = createWriteRequest({ kind: "marketCancel", contracts, listingId: 7n });
    const withdraw = createWriteRequest({ kind: "marketWithdraw", contracts });

    expect(buy).toMatchObject({ address: contracts.Marketplace, functionName: "buy", args: [7n], value: 15_000_000_000_000_000n });
    expect(cancel).toMatchObject({ address: contracts.Marketplace, functionName: "cancel", args: [7n] });
    expect(withdraw).toMatchObject({ address: contracts.Marketplace, functionName: "withdrawProceeds", args: [] });
  });

  it("builds buyback acceptance and payout requests", () => {
    const accept = createWriteRequest({
      kind: "buybackAccept",
      contracts,
      tokenId: 1001n,
      amount: 1n
    });
    const withdraw = createWriteRequest({ kind: "buybackWithdraw", contracts });

    expect(accept).toMatchObject({
      address: contracts.BuybackVault,
      functionName: "acceptQuote",
      args: [1001n, 1n]
    });
    expect(withdraw).toMatchObject({
      address: contracts.BuybackVault,
      functionName: "withdrawPayout",
      args: []
    });
  });

  it("builds Forge and redemption requests", () => {
    const imprintHash = `0x${"ab".repeat(32)}` as const;
    const craft = createWriteRequest({
      kind: "forgeCraft",
      contracts,
      recipeId: 2n,
      imprintHash,
      value: 1_000_000_000_000_000n
    });
    const redeem = createWriteRequest({ kind: "redemptionRequest", contracts, tokenId: 1001n });

    expect(craft.address).toBe(contracts.Forge);
    expect(craft.functionName).toBe("craftWithImprint");
    expect(craft.args).toEqual([2n, imprintHash]);
    expect(craft.value).toBe(1_000_000_000_000_000n);
    expect(redeem.address).toBe(contracts.RedemptionRegistry);
    expect(redeem.functionName).toBe("requestRedemption");
    expect(redeem.args).toEqual([1001n]);
  });

  it("builds pack reveal and redemption admin requests", () => {
    const reveal = createWriteRequest({ kind: "packReveal", contracts, purchaseId: 7n });
    const approve = createWriteRequest({ kind: "redemptionApprove", contracts, requestId: 2n });
    const packed = createWriteRequest({ kind: "redemptionMarkPacked", contracts, requestId: 2n });
    const shipped = createWriteRequest({
      kind: "redemptionMarkShipped",
      contracts,
      requestId: 3n,
      trackingRef: "UPS-TEST-1"
    });
    const completed = createWriteRequest({ kind: "redemptionComplete", contracts, requestId: 3n });
    const cancelled = createWriteRequest({
      kind: "redemptionCancel",
      contracts,
      requestId: 4n,
      reason: "testnet operator cancellation"
    });

    expect(reveal.address).toBe(contracts.PackSale);
    expect(reveal.functionName).toBe("reveal");
    expect(reveal.args).toEqual([7n]);
    expect(approve.functionName).toBe("approve");
    expect(approve.args).toEqual([2n]);
    expect(packed.functionName).toBe("markPacked");
    expect(packed.args).toEqual([2n]);
    expect(shipped.functionName).toBe("markShipped");
    expect(shipped.args).toEqual([3n, "UPS-TEST-1"]);
    expect(completed.functionName).toBe("complete");
    expect(completed.args).toEqual([3n]);
    expect(cancelled.functionName).toBe("cancel");
    expect(cancelled.args).toEqual([4n, "testnet operator cancellation"]);
  });

  it("sanitizes common wallet errors", () => {
    expect(getTransactionErrorMessage(Object.assign(new Error("rejected"), { code: 4001 }))).toMatch(/rejected/i);
    expect(getTransactionErrorMessage(new Error("insufficient funds for gas * price + value"))).toMatch(
      /enough testnet ETH/i
    );
    expect(getTransactionErrorMessage({})).toMatch(/failed/i);
  });

  it("formats hashes and explorer URLs", () => {
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hash;

    expect(formatTransactionHash(hash)).toBe("0x1234...cdef");
    expect(buildExplorerTxUrl(hash)).toContain(hash);
    expect(robinhoodTestnetChainId).toBe(46630);
  });

  it("waits for receipts through the supplied client", async () => {
    const receipt = { blockNumber: 12n, status: "success", transactionHash: "0xabc" as Hash };
    const client = { waitForTransactionReceipt: vi.fn().mockResolvedValue(receipt) };

    await expect(waitForTransactionReceipt(client, "0xabc" as Hash)).resolves.toBe(receipt);
    expect(client.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xabc", timeout: 60_000 });
  });
});
