import { expect } from "chai";
import { ethers } from "hardhat";
import type { BaseContract, BigNumberish, ContractRunner, ContractTransactionResponse } from "ethers";
import { deployProtocolFixture } from "./helpers/deploy";

const buybackTokenId = 8001n;
const buybackTokenUri = "ipfs://items/buyback-game-item-8001.json";
const buybackAmount = 2n;
const quotePrice = ethers.parseEther("0.2");

type ProtocolFixture = Awaited<ReturnType<typeof deployProtocolFixture>>;

type RejectingNativeParticipant = Omit<BaseContract, "connect"> & {
  approveItemOperator(itemToken: string, operator: string): Promise<ContractTransactionResponse>;
  acceptBuybackQuote(
    buybackVault: string,
    tokenId: BigNumberish,
    amount: BigNumberish
  ): Promise<ContractTransactionResponse>;
  withdrawBuybackPayout(buybackVault: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): RejectingNativeParticipant;
};

async function mintSellerTokens(amount = buybackAmount): Promise<ProtocolFixture> {
  const fixture = await deployProtocolFixture();
  const { itemToken, minter, owner } = fixture;

  await itemToken.connect(minter).mintGameItem(owner.address, buybackTokenId, amount, buybackTokenUri);

  return fixture;
}

async function mintApproveQuoteAndFund(
  amount = buybackAmount,
  price = quotePrice
): Promise<ProtocolFixture> {
  const fixture = await mintSellerTokens(amount);
  const { buybackVault, buybackAdmin, itemToken, owner, treasury } = fixture;

  await itemToken.connect(owner).setApprovalForAll(await buybackVault.getAddress(), true);
  await buybackVault.connect(buybackAdmin).setQuote(buybackTokenId, price, true);
  await treasury.sendTransaction({
    to: await buybackVault.getAddress(),
    value: price * amount
  });

  return fixture;
}

async function deployRejectingNativeParticipant(): Promise<RejectingNativeParticipant> {
  const participant = (await ethers.deployContract(
    "RejectingNativeParticipant"
  )) as unknown as RejectingNativeParticipant;
  await participant.waitForDeployment();

  return participant;
}

describe("BuybackVault", function () {
  it("lets an admin set an active token quote", async function () {
    const { buybackVault, buybackAdmin } = await deployProtocolFixture();

    await expect(buybackVault.connect(buybackAdmin).setQuote(buybackTokenId, quotePrice, true))
      .to.emit(buybackVault, "QuoteSet")
      .withArgs(buybackTokenId, quotePrice, true);

    const quote = await buybackVault.quotes(buybackTokenId);
    expect(quote.price).to.equal(quotePrice);
    expect(quote.active).to.equal(true);
  });

  it("rejects buyback without an active quote", async function () {
    const fixture = await mintSellerTokens();
    const { buybackVault, itemToken, owner } = fixture;

    await itemToken.connect(owner).setApprovalForAll(await buybackVault.getAddress(), true);

    await expect(buybackVault.connect(owner).acceptQuote(buybackTokenId, 1n))
      .to.be.revertedWithCustomError(buybackVault, "QuoteInactive")
      .withArgs(buybackTokenId);
  });

  it("requires user ERC-1155 approval before accepting a quote", async function () {
    const fixture = await mintSellerTokens();
    const { buybackVault, buybackAdmin, itemToken, owner, treasury } = fixture;

    await buybackVault.connect(buybackAdmin).setQuote(buybackTokenId, quotePrice, true);
    await treasury.sendTransaction({ to: await buybackVault.getAddress(), value: quotePrice });

    await expect(buybackVault.connect(owner).acceptQuote(buybackTokenId, 1n))
      .to.be.revertedWithCustomError(itemToken, "ERC1155MissingApprovalForAll")
      .withArgs(await buybackVault.getAddress(), owner.address);
  });

  it("transfers accepted tokens into the vault", async function () {
    const { buybackVault, itemToken, owner } = await mintApproveQuoteAndFund();
    const buybackVaultAddress = await buybackVault.getAddress();

    await expect(buybackVault.connect(owner).acceptQuote(buybackTokenId, buybackAmount))
      .to.emit(buybackVault, "BuybackAccepted")
      .withArgs(owner.address, buybackTokenId, buybackAmount, quotePrice * buybackAmount);

    expect(await itemToken.balanceOf(owner.address, buybackTokenId)).to.equal(0n);
    expect(await itemToken.balanceOf(buybackVaultAddress, buybackTokenId)).to.equal(buybackAmount);
    expect(await buybackVault.payoutCredit(owner.address)).to.equal(quotePrice * buybackAmount);
  });

  it("pays the quoted native amount from vault balance", async function () {
    const { buybackVault, owner } = await mintApproveQuoteAndFund();
    const totalPayout = quotePrice * buybackAmount;

    await expect(
      buybackVault.connect(owner).acceptQuote(buybackTokenId, buybackAmount)
    ).to.changeEtherBalances([buybackVault, owner], [0n, 0n]);

    expect(await buybackVault.payoutCredit(owner.address)).to.equal(totalPayout);

    const withdrawal = buybackVault.connect(owner).withdrawPayout();
    await expect(withdrawal)
      .to.emit(buybackVault, "PayoutWithdrawn")
      .withArgs(owner.address, owner.address, totalPayout);
    await expect(withdrawal).to.changeEtherBalances([buybackVault, owner], [-totalPayout, totalPayout]);
    expect(await buybackVault.payoutCredit(owner.address)).to.equal(0n);
  });

  it("rejects buyback when the vault lacks funds", async function () {
    const fixture = await mintSellerTokens();
    const { buybackVault, buybackAdmin, itemToken, owner } = fixture;
    const totalPayout = quotePrice * buybackAmount;

    await itemToken.connect(owner).setApprovalForAll(await buybackVault.getAddress(), true);
    await buybackVault.connect(buybackAdmin).setQuote(buybackTokenId, quotePrice, true);

    await expect(buybackVault.connect(owner).acceptQuote(buybackTokenId, buybackAmount))
      .to.be.revertedWithCustomError(buybackVault, "InsufficientVaultBalance")
      .withArgs(totalPayout, 0n);

    expect(await itemToken.balanceOf(owner.address, buybackTokenId)).to.equal(buybackAmount);
    expect(await itemToken.balanceOf(await buybackVault.getAddress(), buybackTokenId)).to.equal(0n);
  });

  it("lets an admin withdraw protocol-held tokens", async function () {
    const { buybackVault, buybackAdmin, itemToken, owner, recipient } = await mintApproveQuoteAndFund();

    await buybackVault.connect(owner).acceptQuote(buybackTokenId, buybackAmount);

    await expect(buybackVault.connect(buybackAdmin).withdrawToken(recipient.address, buybackTokenId, buybackAmount))
      .to.emit(buybackVault, "TokenWithdrawn")
      .withArgs(recipient.address, buybackTokenId, buybackAmount);

    expect(await itemToken.balanceOf(recipient.address, buybackTokenId)).to.equal(buybackAmount);
    expect(await itemToken.balanceOf(await buybackVault.getAddress(), buybackTokenId)).to.equal(0n);
  });

  it("lets a rejecting-native seller accept a quote and preserves credit after failed withdraw", async function () {
    const fixture = await deployProtocolFixture();
    const { buybackVault, buybackAdmin, itemToken, minter, treasury } = fixture;
    const rejectingSeller = await deployRejectingNativeParticipant();
    const rejectingSellerAddress = await rejectingSeller.getAddress();
    const buybackVaultAddress = await buybackVault.getAddress();
    const totalPayout = quotePrice * buybackAmount;

    await itemToken
      .connect(minter)
      .mintGameItem(rejectingSellerAddress, buybackTokenId, buybackAmount, buybackTokenUri);
    await rejectingSeller.approveItemOperator(await itemToken.getAddress(), buybackVaultAddress);
    await buybackVault.connect(buybackAdmin).setQuote(buybackTokenId, quotePrice, true);
    await treasury.sendTransaction({ to: buybackVaultAddress, value: totalPayout });

    await expect(rejectingSeller.acceptBuybackQuote(buybackVaultAddress, buybackTokenId, buybackAmount))
      .to.emit(buybackVault, "BuybackAccepted")
      .withArgs(rejectingSellerAddress, buybackTokenId, buybackAmount, totalPayout);

    expect(await itemToken.balanceOf(rejectingSellerAddress, buybackTokenId)).to.equal(0n);
    expect(await itemToken.balanceOf(buybackVaultAddress, buybackTokenId)).to.equal(buybackAmount);
    expect(await buybackVault.payoutCredit(rejectingSellerAddress)).to.equal(totalPayout);

    await expect(rejectingSeller.withdrawBuybackPayout(buybackVaultAddress))
      .to.be.revertedWithCustomError(buybackVault, "TransferFailed")
      .withArgs(rejectingSellerAddress, totalPayout);
    expect(await buybackVault.payoutCredit(rejectingSellerAddress)).to.equal(totalPayout);
  });

  it("rejects zero-address payout withdrawal targets", async function () {
    const { buybackVault, owner } = await mintApproveQuoteAndFund(1n);

    await buybackVault.connect(owner).acceptQuote(buybackTokenId, 1n);

    await expect(
      buybackVault.connect(owner).withdrawPayoutTo(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(buybackVault, "InvalidAddress");
    expect(await buybackVault.payoutCredit(owner.address)).to.equal(quotePrice);
  });

  it("handles zero-price quotes as inactive quotes", async function () {
    const fixture = await mintSellerTokens(1n);
    const { buybackVault, buybackAdmin, itemToken, owner } = fixture;

    await expect(buybackVault.connect(buybackAdmin).setQuote(buybackTokenId, 0n, true))
      .to.be.revertedWithCustomError(buybackVault, "InvalidQuotePrice")
      .withArgs(buybackTokenId);

    await buybackVault.connect(buybackAdmin).setQuote(buybackTokenId, 0n, false);
    await itemToken.connect(owner).setApprovalForAll(await buybackVault.getAddress(), true);

    const quote = await buybackVault.quotes(buybackTokenId);
    expect(quote.price).to.equal(0n);
    expect(quote.active).to.equal(false);
    await expect(buybackVault.connect(owner).acceptQuote(buybackTokenId, 1n))
      .to.be.revertedWithCustomError(buybackVault, "QuoteInactive")
      .withArgs(buybackTokenId);
  });

  it("restricts native withdrawals to buyback admins", async function () {
    const { buybackVault, buybackAdmin, other, recipient, treasury } = await deployProtocolFixture();
    const withdrawalAmount = ethers.parseEther("0.1");

    await treasury.sendTransaction({ to: await buybackVault.getAddress(), value: withdrawalAmount });

    await expect(buybackVault.connect(other).withdrawNative(recipient.address, withdrawalAmount))
      .to.be.revertedWithCustomError(buybackVault, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await buybackVault.BUYBACK_ADMIN_ROLE());

    await expect(
      buybackVault.connect(buybackAdmin).withdrawNative(recipient.address, withdrawalAmount)
    ).to.changeEtherBalances([buybackVault, recipient], [-withdrawalAmount, withdrawalAmount]);
  });

  it("rejects quote acceptance while paused", async function () {
    const { buybackVault, buybackAdmin, owner } = await mintApproveQuoteAndFund(1n);

    await buybackVault.connect(buybackAdmin).pause();

    await expect(
      buybackVault.connect(owner).acceptQuote(buybackTokenId, 1n)
    ).to.be.revertedWithCustomError(buybackVault, "EnforcedPause");
  });

  it("restricts buyback controls to the buyback admin role", async function () {
    const { buybackVault, buybackAdmin, other, recipient } = await deployProtocolFixture();
    const role = await buybackVault.BUYBACK_ADMIN_ROLE();
    const pauserRole = await buybackVault.PAUSER_ROLE();

    await expect(buybackVault.connect(other).setQuote(buybackTokenId, quotePrice, true))
      .to.be.revertedWithCustomError(buybackVault, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await expect(buybackVault.connect(other).withdrawToken(recipient.address, buybackTokenId, 1n))
      .to.be.revertedWithCustomError(buybackVault, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await expect(buybackVault.connect(other).withdrawNative(recipient.address, 1n))
      .to.be.revertedWithCustomError(buybackVault, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await expect(buybackVault.connect(other).pause())
      .to.be.revertedWithCustomError(buybackVault, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, pauserRole);

    await buybackVault.connect(buybackAdmin).pause();

    await expect(buybackVault.connect(other).unpause())
      .to.be.revertedWithCustomError(buybackVault, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, pauserRole);

    await buybackVault.connect(buybackAdmin).unpause();
  });

  it("rejects zero-amount buybacks", async function () {
    const { buybackVault, buybackAdmin, owner } = await mintSellerTokens(1n);

    await buybackVault.connect(buybackAdmin).setQuote(buybackTokenId, quotePrice, true);

    await expect(
      buybackVault.connect(owner).acceptQuote(buybackTokenId, 0n)
    ).to.be.revertedWithCustomError(buybackVault, "InvalidAmount");
  });

  it("rejects zero item token constructor addresses", async function () {
    const buybackVaultFactory = await ethers.getContractFactory("BuybackVault");

    await expect(buybackVaultFactory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      buybackVaultFactory,
      "InvalidAddress"
    );
  });
});
