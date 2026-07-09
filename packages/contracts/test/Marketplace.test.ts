import { expect } from "chai";
import { ethers } from "hardhat";
import type { BaseContract, BigNumberish, ContractRunner, ContractTransactionResponse } from "ethers";
import { deployProtocolFixture } from "./helpers/deploy";

const listedTokenId = 7001n;
const listedTokenUri = "ipfs://items/listed-game-item-7001.json";
const listedAmount = 3n;
const listingPrice = ethers.parseEther("1.5");
const protocolFeeBps = 250n;

type ProtocolFixture = Awaited<ReturnType<typeof deployProtocolFixture>>;

type RejectingNativeParticipant = Omit<BaseContract, "connect"> & {
  approveItemOperator(itemToken: string, operator: string): Promise<ContractTransactionResponse>;
  listItem(
    marketplace: string,
    tokenId: BigNumberish,
    amount: BigNumberish,
    price: BigNumberish
  ): Promise<ContractTransactionResponse>;
  withdrawMarketplaceProceeds(marketplace: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): RejectingNativeParticipant;
};

type NonERC1155MarketplaceBuyer = Omit<BaseContract, "connect"> & {
  buyListing(
    marketplace: string,
    listingId: BigNumberish,
    overrides?: { value?: BigNumberish }
  ): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): NonERC1155MarketplaceBuyer;
};

async function mintSellerItems(amount = listedAmount): Promise<ProtocolFixture> {
  const fixture = await deployProtocolFixture();
  const { itemToken, minter, owner } = fixture;

  await itemToken.connect(minter).mintGameItem(owner.address, listedTokenId, amount, listedTokenUri);

  return fixture;
}

async function mintApproveAndList(
  amount = listedAmount,
  price = listingPrice
): Promise<{ fixture: ProtocolFixture; listingId: bigint }> {
  const fixture = await mintSellerItems(amount);
  const { itemToken, marketplace, owner } = fixture;

  await itemToken.connect(owner).setApprovalForAll(await marketplace.getAddress(), true);
  await marketplace.connect(owner).list(listedTokenId, amount, price);

  return { fixture, listingId: 1n };
}

async function deployRejectingNativeParticipant(): Promise<RejectingNativeParticipant> {
  const participant = (await ethers.deployContract(
    "RejectingNativeParticipant"
  )) as unknown as RejectingNativeParticipant;
  await participant.waitForDeployment();

  return participant;
}

async function deployNonERC1155MarketplaceBuyer(): Promise<NonERC1155MarketplaceBuyer> {
  const buyer = (await ethers.deployContract(
    "NonERC1155MarketplaceBuyer"
  )) as unknown as NonERC1155MarketplaceBuyer;
  await buyer.waitForDeployment();

  return buyer;
}

describe("Marketplace", function () {
  it("escrows listed ERC-1155 items", async function () {
    const fixture = await mintSellerItems();
    const { itemToken, marketplace, owner } = fixture;
    const marketplaceAddress = await marketplace.getAddress();

    await itemToken.connect(owner).setApprovalForAll(marketplaceAddress, true);

    await expect(marketplace.connect(owner).list(listedTokenId, listedAmount, listingPrice))
      .to.emit(marketplace, "ListingCreated")
      .withArgs(1n, owner.address, listedTokenId, listedAmount, listingPrice);

    const listing = await marketplace.listings(1n);
    expect(listing.seller).to.equal(owner.address);
    expect(listing.tokenId).to.equal(listedTokenId);
    expect(listing.amount).to.equal(listedAmount);
    expect(listing.price).to.equal(listingPrice);
    expect(listing.active).to.equal(true);
    expect(listing.sold).to.equal(false);
    expect(listing.cancelled).to.equal(false);
    expect(await itemToken.balanceOf(owner.address, listedTokenId)).to.equal(0n);
    expect(await itemToken.balanceOf(marketplaceAddress, listedTokenId)).to.equal(listedAmount);
  });

  it("rejects listings with zero price or zero amount", async function () {
    const fixture = await mintSellerItems();
    const { itemToken, marketplace, owner } = fixture;

    await itemToken.connect(owner).setApprovalForAll(await marketplace.getAddress(), true);

    await expect(
      marketplace.connect(owner).list(listedTokenId, 0n, listingPrice)
    ).to.be.revertedWithCustomError(marketplace, "InvalidListingAmount");

    await expect(
      marketplace.connect(owner).list(listedTokenId, listedAmount, 0n)
    ).to.be.revertedWithCustomError(marketplace, "InvalidListingPrice");
  });

  it("requires seller ERC-1155 approval before listing", async function () {
    const fixture = await mintSellerItems();
    const { itemToken, marketplace, owner } = fixture;

    await expect(marketplace.connect(owner).list(listedTokenId, listedAmount, listingPrice))
      .to.be.revertedWithCustomError(itemToken, "ERC1155MissingApprovalForAll")
      .withArgs(await marketplace.getAddress(), owner.address);
  });

  it("lets the seller cancel an active listing", async function () {
    const {
      fixture: { itemToken, marketplace, owner },
      listingId
    } = await mintApproveAndList();

    await expect(marketplace.connect(owner).cancel(listingId))
      .to.emit(marketplace, "ListingCancelled")
      .withArgs(listingId, owner.address);

    const listing = await marketplace.listings(listingId);
    expect(listing.active).to.equal(false);
    expect(listing.cancelled).to.equal(true);
    expect(await itemToken.balanceOf(owner.address, listedTokenId)).to.equal(listedAmount);
    expect(await itemToken.balanceOf(await marketplace.getAddress(), listedTokenId)).to.equal(0n);
  });

  it("rejects non-seller listing cancellations", async function () {
    const {
      fixture: { marketplace, other },
      listingId
    } = await mintApproveAndList();

    await expect(marketplace.connect(other).cancel(listingId))
      .to.be.revertedWithCustomError(marketplace, "UnauthorizedListingCancel")
      .withArgs(listingId, other.address);
  });

  it("sells the full listing for the exact price", async function () {
    const {
      fixture: { itemToken, marketplace, buyer },
      listingId
    } = await mintApproveAndList();

    await expect(marketplace.connect(buyer).buy(listingId, { value: listingPrice }))
      .to.emit(marketplace, "ListingSold")
      .withArgs(listingId, buyer.address, listingPrice, 0n);

    const listing = await marketplace.listings(listingId);
    expect(listing.active).to.equal(false);
    expect(listing.sold).to.equal(true);
    expect(await itemToken.balanceOf(buyer.address, listedTokenId)).to.equal(listedAmount);
    expect(await itemToken.balanceOf(await marketplace.getAddress(), listedTokenId)).to.equal(0n);
  });

  it("rejects underpaid and overpaid listing buys", async function () {
    const {
      fixture: { marketplace, buyer },
      listingId
    } = await mintApproveAndList();

    await expect(marketplace.connect(buyer).buy(listingId, { value: listingPrice - 1n }))
      .to.be.revertedWithCustomError(marketplace, "ExactPaymentRequired")
      .withArgs(listingPrice, listingPrice - 1n);

    await expect(marketplace.connect(buyer).buy(listingId, { value: listingPrice + 1n }))
      .to.be.revertedWithCustomError(marketplace, "ExactPaymentRequired")
      .withArgs(listingPrice, listingPrice + 1n);
  });

  it("pays seller proceeds minus protocol fee", async function () {
    const {
      fixture: { marketplace, marketAdmin, owner, buyer, treasury },
      listingId
    } = await mintApproveAndList();
    const fee = (listingPrice * protocolFeeBps) / 10_000n;
    const proceeds = listingPrice - fee;

    await marketplace.connect(marketAdmin).setFeeBps(protocolFeeBps);

    await expect(marketplace.connect(buyer).buy(listingId, { value: listingPrice })).to.changeEtherBalances(
      [buyer, marketplace, owner, treasury],
      [-listingPrice, listingPrice, 0n, 0n]
    );

    expect(await marketplace.proceedsCredit(owner.address)).to.equal(proceeds);
    expect(await marketplace.proceedsCredit(treasury.address)).to.equal(fee);

    const withdrawal = marketplace.connect(owner).withdrawProceeds();
    await expect(withdrawal)
      .to.emit(marketplace, "ProceedsWithdrawn")
      .withArgs(owner.address, owner.address, proceeds);
    await expect(withdrawal).to.changeEtherBalances([marketplace, owner], [-proceeds, proceeds]);
    expect(await marketplace.proceedsCredit(owner.address)).to.equal(0n);
  });

  it("pays protocol fees to the treasury", async function () {
    const {
      fixture: { marketplace, marketAdmin, buyer, treasury },
      listingId
    } = await mintApproveAndList();
    const fee = (listingPrice * protocolFeeBps) / 10_000n;

    await marketplace.connect(marketAdmin).setFeeBps(protocolFeeBps);

    await marketplace.connect(buyer).buy(listingId, { value: listingPrice });

    expect(await marketplace.proceedsCredit(treasury.address)).to.equal(fee);

    const withdrawal = marketplace.connect(treasury).withdrawProceeds();
    await expect(withdrawal)
      .to.emit(marketplace, "ProceedsWithdrawn")
      .withArgs(treasury.address, treasury.address, fee);
    await expect(withdrawal).to.changeEtherBalances([marketplace, treasury], [-fee, fee]);
    expect(await marketplace.proceedsCredit(treasury.address)).to.equal(0n);
  });

  it("does not block buys when the seller rejects native ETH", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, marketplace, minter, buyer } = fixture;
    const rejectingSeller = await deployRejectingNativeParticipant();
    const rejectingSellerAddress = await rejectingSeller.getAddress();
    const marketplaceAddress = await marketplace.getAddress();

    await itemToken
      .connect(minter)
      .mintGameItem(rejectingSellerAddress, listedTokenId, listedAmount, listedTokenUri);
    await rejectingSeller.approveItemOperator(await itemToken.getAddress(), marketplaceAddress);
    await rejectingSeller.listItem(marketplaceAddress, listedTokenId, listedAmount, listingPrice);

    await expect(marketplace.connect(buyer).buy(1n, { value: listingPrice }))
      .to.emit(marketplace, "ListingSold")
      .withArgs(1n, buyer.address, listingPrice, 0n);

    const listing = await marketplace.listings(1n);
    expect(listing.active).to.equal(false);
    expect(listing.sold).to.equal(true);
    expect(await itemToken.balanceOf(buyer.address, listedTokenId)).to.equal(listedAmount);
    expect(await marketplace.proceedsCredit(rejectingSellerAddress)).to.equal(listingPrice);
  });

  it("does not block buys when the treasury rejects native ETH", async function () {
    const {
      fixture: { marketplace, marketAdmin, owner, buyer },
      listingId
    } = await mintApproveAndList();
    const rejectingTreasury = await deployRejectingNativeParticipant();
    const rejectingTreasuryAddress = await rejectingTreasury.getAddress();
    const fee = (listingPrice * protocolFeeBps) / 10_000n;
    const proceeds = listingPrice - fee;

    await marketplace.connect(marketAdmin).setTreasury(rejectingTreasuryAddress);
    await marketplace.connect(marketAdmin).setFeeBps(protocolFeeBps);

    await expect(marketplace.connect(buyer).buy(listingId, { value: listingPrice }))
      .to.emit(marketplace, "ListingSold")
      .withArgs(listingId, buyer.address, listingPrice, fee);

    expect(await marketplace.proceedsCredit(owner.address)).to.equal(proceeds);
    expect(await marketplace.proceedsCredit(rejectingTreasuryAddress)).to.equal(fee);
  });

  it("preserves seller credit when native withdrawal fails", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, marketplace, minter, buyer } = fixture;
    const rejectingSeller = await deployRejectingNativeParticipant();
    const rejectingSellerAddress = await rejectingSeller.getAddress();
    const marketplaceAddress = await marketplace.getAddress();

    await itemToken
      .connect(minter)
      .mintGameItem(rejectingSellerAddress, listedTokenId, listedAmount, listedTokenUri);
    await rejectingSeller.approveItemOperator(await itemToken.getAddress(), marketplaceAddress);
    await rejectingSeller.listItem(marketplaceAddress, listedTokenId, listedAmount, listingPrice);
    await marketplace.connect(buyer).buy(1n, { value: listingPrice });

    await expect(rejectingSeller.withdrawMarketplaceProceeds(marketplaceAddress))
      .to.be.revertedWithCustomError(marketplace, "TransferFailed")
      .withArgs(rejectingSellerAddress, listingPrice);
    expect(await marketplace.proceedsCredit(rejectingSellerAddress)).to.equal(listingPrice);
  });

  it("rejects zero-address proceeds withdrawal targets", async function () {
    const {
      fixture: { marketplace, owner, buyer },
      listingId
    } = await mintApproveAndList();

    await marketplace.connect(buyer).buy(listingId, { value: listingPrice });

    await expect(
      marketplace.connect(owner).withdrawProceedsTo(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(marketplace, "InvalidAddress");
    expect(await marketplace.proceedsCredit(owner.address)).to.equal(listingPrice);
  });

  it("rejects buys for inactive listings", async function () {
    const {
      fixture: { marketplace, owner, buyer },
      listingId
    } = await mintApproveAndList();

    await marketplace.connect(owner).cancel(listingId);

    await expect(marketplace.connect(buyer).buy(listingId, { value: listingPrice }))
      .to.be.revertedWithCustomError(marketplace, "ListingNotActive")
      .withArgs(listingId);
  });

  it("caps protocol fees at 1000 bps", async function () {
    const { marketplace, marketAdmin } = await deployProtocolFixture();

    await marketplace.connect(marketAdmin).setFeeBps(1000n);
    expect(await marketplace.feeBps()).to.equal(1000n);

    await expect(marketplace.connect(marketAdmin).setFeeBps(1001n))
      .to.be.revertedWithCustomError(marketplace, "FeeTooHigh")
      .withArgs(1001n);
  });

  it("rejects list and buy while paused", async function () {
    const {
      fixture: { itemToken, marketplace, owner, marketAdmin, buyer },
      listingId
    } = await mintApproveAndList();

    await marketplace.connect(marketAdmin).pause();

    await expect(
      marketplace.connect(buyer).buy(listingId, { value: listingPrice })
    ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");

    await itemToken.connect(owner).setApprovalForAll(await marketplace.getAddress(), true);

    await expect(
      marketplace.connect(owner).list(listedTokenId, 1n, listingPrice)
    ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
  });

  it("restricts market controls to the market admin role", async function () {
    const { marketplace, marketAdmin, other, recipient } = await deployProtocolFixture();
    const role = await marketplace.MARKET_ADMIN_ROLE();

    await expect(marketplace.connect(other).setFeeBps(1n))
      .to.be.revertedWithCustomError(marketplace, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await expect(marketplace.connect(other).setTreasury(recipient.address))
      .to.be.revertedWithCustomError(marketplace, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await expect(marketplace.connect(other).pause())
      .to.be.revertedWithCustomError(marketplace, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await marketplace.connect(marketAdmin).pause();

    await expect(marketplace.connect(other).unpause())
      .to.be.revertedWithCustomError(marketplace, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await marketplace.connect(marketAdmin).unpause();
  });

  it("keeps listing state intact when a non-ERC1155Receiver buyer contract rejects the item", async function () {
    const {
      fixture: { itemToken, marketplace },
      listingId
    } = await mintApproveAndList();
    const nonReceiverBuyer = await deployNonERC1155MarketplaceBuyer();
    const nonReceiverBuyerAddress = await nonReceiverBuyer.getAddress();

    await expect(
      nonReceiverBuyer.buyListing(await marketplace.getAddress(), listingId, { value: listingPrice })
    )
      .to.be.revertedWithCustomError(itemToken, "ERC1155InvalidReceiver")
      .withArgs(nonReceiverBuyerAddress);

    const listing = await marketplace.listings(listingId);
    expect(listing.active).to.equal(true);
    expect(listing.sold).to.equal(false);
    expect(await itemToken.balanceOf(await marketplace.getAddress(), listedTokenId)).to.equal(listedAmount);
    expect(await itemToken.balanceOf(nonReceiverBuyerAddress, listedTokenId)).to.equal(0n);
  });

  it("rejects zero treasury addresses", async function () {
    const { itemToken, marketplace, marketAdmin } = await deployProtocolFixture();
    const marketplaceFactory = await ethers.getContractFactory("Marketplace");

    await expect(
      marketplaceFactory.deploy(await itemToken.getAddress(), ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(marketplaceFactory, "InvalidAddress");

    await expect(
      marketplace.connect(marketAdmin).setTreasury(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(marketplace, "InvalidAddress");
  });
});
