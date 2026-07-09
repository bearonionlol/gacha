import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployProtocolFixture } from "./helpers/deploy";

const redeemableInventoryId = "redemption-redeemable-001";
const nonRedeemableInventoryId = "redemption-display-001";
const unanchoredInventoryId = "redemption-unanchored-001";
const inventoryTokenUri = "ipfs://items/redemption-redeemable-001.json";
const gameTokenId = 12_001n;
const gameTokenUri = "ipfs://items/redemption-game-12001.json";
const trackingRef = "1Z999AA10123456784";
const cancelReason = "customer requested cancellation";

const RedemptionStatus = {
  Requested: 0n,
  Approved: 1n,
  Packed: 2n,
  Shipped: 3n,
  Completed: 4n,
  Cancelled: 5n
} as const;

const erc1155ReceiverInterfaceId = "0x4e2312e0";

type ProtocolFixture = Awaited<ReturnType<typeof deployProtocolFixture>>;

function physicalTokenIdFor(inventoryId: string): bigint {
  return BigInt(ethers.keccak256(ethers.solidityPacked(["string", "string"], ["inventory:", inventoryId])));
}

function inventoryHashFor(inventoryId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`inventory:${inventoryId}:v1`));
}

async function anchorAndMintInventory(
  fixture: ProtocolFixture,
  inventoryId: string,
  owner: HardhatEthersSigner,
  redeemable = true
): Promise<bigint> {
  const { registry, itemToken, inventoryAdmin, tokenizer, minter } = fixture;
  const tokenId = physicalTokenIdFor(inventoryId);
  const tokenUri = `ipfs://items/${inventoryId}.json`;

  await registry
    .connect(inventoryAdmin)
    .anchorInventory(inventoryId, inventoryHashFor(inventoryId), tokenUri, redeemable, false);
  await registry.connect(tokenizer).markTokenized(inventoryId, owner.address);
  await itemToken.connect(minter).mintInventoryItem(owner.address, tokenId, inventoryId, tokenUri);

  return tokenId;
}

async function requestRedeemableToken(
  fixture: ProtocolFixture,
  inventoryId = redeemableInventoryId,
  owner = fixture.owner
): Promise<{ tokenId: bigint; requestId: bigint }> {
  const tokenId = await anchorAndMintInventory(fixture, inventoryId, owner, true);

  await fixture.itemToken
    .connect(owner)
    .setApprovalForAll(await fixture.redemptionRegistry.getAddress(), true);
  await fixture.redemptionRegistry.connect(owner).requestRedemption(tokenId);

  return { tokenId, requestId: 1n };
}

async function shipRequest(fixture: ProtocolFixture, requestId: bigint): Promise<void> {
  const { redemptionRegistry, redemptionAdmin } = fixture;

  await redemptionRegistry.connect(redemptionAdmin).approve(requestId);
  await redemptionRegistry.connect(redemptionAdmin).markPacked(requestId);
  await redemptionRegistry.connect(redemptionAdmin).markShipped(requestId, trackingRef);
}

describe("RedemptionRegistry", function () {
  it("escrows a user-owned redeemable token on request", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, redemptionRegistry, owner } = fixture;
    const tokenId = await anchorAndMintInventory(fixture, redeemableInventoryId, owner, true);
    const redemptionRegistryAddress = await redemptionRegistry.getAddress();

    await itemToken.connect(owner).setApprovalForAll(redemptionRegistryAddress, true);

    await expect(redemptionRegistry.connect(owner).requestRedemption(tokenId))
      .to.emit(redemptionRegistry, "RedemptionRequested")
      .withArgs(1n, owner.address, tokenId);

    const request = await redemptionRegistry.requests(1n);
    expect(request.requester).to.equal(owner.address);
    expect(request.tokenId).to.equal(tokenId);
    expect(request.status).to.equal(RedemptionStatus.Requested);
    expect(request.trackingRef).to.equal("");
    expect(request.reason).to.equal("");
    expect(await itemToken.balanceOf(owner.address, tokenId)).to.equal(0n);
    expect(await itemToken.balanceOf(redemptionRegistryAddress, tokenId)).to.equal(1n);
  });

  it("rejects redemption for non-redeemable inventory", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, redemptionRegistry, owner } = fixture;
    const tokenId = await anchorAndMintInventory(fixture, nonRedeemableInventoryId, owner, false);

    await itemToken.connect(owner).setApprovalForAll(await redemptionRegistry.getAddress(), true);

    await expect(redemptionRegistry.connect(owner).requestRedemption(tokenId))
      .to.be.revertedWithCustomError(redemptionRegistry, "InventoryNotRedeemable")
      .withArgs(tokenId);
  });

  it("tracks requested, approved, packed, shipped, completed, and cancelled statuses", async function () {
    const fixture = await deployProtocolFixture();
    const { redemptionRegistry, redemptionAdmin, owner } = fixture;
    const { requestId } = await requestRedeemableToken(fixture);

    expect((await redemptionRegistry.requests(requestId)).status).to.equal(RedemptionStatus.Requested);

    await expect(redemptionRegistry.connect(redemptionAdmin).approve(requestId))
      .to.emit(redemptionRegistry, "RedemptionStatusUpdated")
      .withArgs(requestId, RedemptionStatus.Requested, RedemptionStatus.Approved);
    expect((await redemptionRegistry.requests(requestId)).status).to.equal(RedemptionStatus.Approved);

    await expect(redemptionRegistry.connect(redemptionAdmin).markPacked(requestId))
      .to.emit(redemptionRegistry, "RedemptionStatusUpdated")
      .withArgs(requestId, RedemptionStatus.Approved, RedemptionStatus.Packed);
    expect((await redemptionRegistry.requests(requestId)).status).to.equal(RedemptionStatus.Packed);

    await expect(redemptionRegistry.connect(redemptionAdmin).markShipped(requestId, trackingRef))
      .to.emit(redemptionRegistry, "RedemptionStatusUpdated")
      .withArgs(requestId, RedemptionStatus.Packed, RedemptionStatus.Shipped);
    const shipped = await redemptionRegistry.requests(requestId);
    expect(shipped.status).to.equal(RedemptionStatus.Shipped);
    expect(shipped.trackingRef).to.equal(trackingRef);

    await redemptionRegistry.connect(redemptionAdmin).complete(requestId);
    expect((await redemptionRegistry.requests(requestId)).status).to.equal(RedemptionStatus.Completed);

    const secondTokenId = await anchorAndMintInventory(fixture, "redemption-cancel-track-001", owner, true);
    await fixture.itemToken
      .connect(owner)
      .setApprovalForAll(await redemptionRegistry.getAddress(), true);
    await redemptionRegistry.connect(owner).requestRedemption(secondTokenId);
    await redemptionRegistry.connect(redemptionAdmin).cancel(2n, cancelReason);

    const cancelled = await redemptionRegistry.requests(2n);
    expect(cancelled.status).to.equal(RedemptionStatus.Cancelled);
    expect(cancelled.reason).to.equal(cancelReason);
  });

  it("restricts fulfillment status changes to the redemption admin role", async function () {
    const fixture = await deployProtocolFixture();
    const { redemptionRegistry, other } = fixture;
    const { requestId } = await requestRedeemableToken(fixture);
    const role = await redemptionRegistry.REDEMPTION_ADMIN_ROLE();

    await expect(redemptionRegistry.connect(other).approve(requestId))
      .to.be.revertedWithCustomError(redemptionRegistry, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);
    await expect(redemptionRegistry.connect(other).markPacked(requestId))
      .to.be.revertedWithCustomError(redemptionRegistry, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);
    await expect(redemptionRegistry.connect(other).markShipped(requestId, trackingRef))
      .to.be.revertedWithCustomError(redemptionRegistry, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);
    await expect(redemptionRegistry.connect(other).complete(requestId))
      .to.be.revertedWithCustomError(redemptionRegistry, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);
    await expect(redemptionRegistry.connect(other).cancel(requestId, cancelReason))
      .to.be.revertedWithCustomError(redemptionRegistry, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);
  });

  it("returns escrowed tokens when an admin cancels a request", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, redemptionRegistry, redemptionAdmin, owner } = fixture;
    const { tokenId, requestId } = await requestRedeemableToken(fixture);

    expect(await itemToken.balanceOf(owner.address, tokenId)).to.equal(0n);

    await redemptionRegistry.connect(redemptionAdmin).approve(requestId);

    await expect(redemptionRegistry.connect(redemptionAdmin).cancel(requestId, cancelReason))
      .to.emit(redemptionRegistry, "RedemptionCancelled")
      .withArgs(requestId, cancelReason);

    const request = await redemptionRegistry.requests(requestId);
    expect(request.status).to.equal(RedemptionStatus.Cancelled);
    expect(request.reason).to.equal(cancelReason);
    expect(await itemToken.balanceOf(owner.address, tokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(await redemptionRegistry.getAddress(), tokenId)).to.equal(0n);
  });

  it("burns escrowed tokens when an admin completes a request", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, redemptionRegistry, redemptionAdmin, owner } = fixture;
    const { tokenId, requestId } = await requestRedeemableToken(fixture);

    await shipRequest(fixture, requestId);

    await expect(redemptionRegistry.connect(redemptionAdmin).complete(requestId))
      .to.emit(redemptionRegistry, "RedemptionStatusUpdated")
      .withArgs(requestId, RedemptionStatus.Shipped, RedemptionStatus.Completed);

    const request = await redemptionRegistry.requests(requestId);
    expect(request.status).to.equal(RedemptionStatus.Completed);
    expect(await itemToken.balanceOf(owner.address, tokenId)).to.equal(0n);
    expect(await itemToken.balanceOf(await redemptionRegistry.getAddress(), tokenId)).to.equal(0n);
    expect(await itemToken["totalSupply(uint256)"](tokenId)).to.equal(0n);
  });

  it("request requires user approval to RedemptionRegistry as ERC1155 operator", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, redemptionRegistry, owner } = fixture;
    const tokenId = await anchorAndMintInventory(fixture, redeemableInventoryId, owner, true);

    await expect(redemptionRegistry.connect(owner).requestRedemption(tokenId))
      .to.be.revertedWithCustomError(itemToken, "ERC1155MissingApprovalForAll")
      .withArgs(await redemptionRegistry.getAddress(), owner.address);
  });

  it("rejects redemption requests from non-owners", async function () {
    const fixture = await deployProtocolFixture();
    const { redemptionRegistry, itemToken, owner, other } = fixture;
    const tokenId = await anchorAndMintInventory(fixture, redeemableInventoryId, owner, true);

    await itemToken.connect(other).setApprovalForAll(await redemptionRegistry.getAddress(), true);

    await expect(redemptionRegistry.connect(other).requestRedemption(tokenId))
      .to.be.revertedWithCustomError(redemptionRegistry, "InsufficientTokenBalance")
      .withArgs(other.address, tokenId);
  });

  it("rejects unanchored physical and non-inventory game token ids", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, redemptionRegistry, minter, owner } = fixture;
    const unanchoredTokenId = physicalTokenIdFor(unanchoredInventoryId);

    await itemToken
      .connect(minter)
      .mintInventoryItem(owner.address, unanchoredTokenId, unanchoredInventoryId, inventoryTokenUri);
    await itemToken.connect(minter).mintGameItem(owner.address, gameTokenId, 1n, gameTokenUri);
    await itemToken.connect(owner).setApprovalForAll(await redemptionRegistry.getAddress(), true);

    await expect(redemptionRegistry.connect(owner).requestRedemption(unanchoredTokenId))
      .to.be.revertedWithCustomError(fixture.registry, "InventoryTokenNotAnchored")
      .withArgs(unanchoredTokenId);
    await expect(redemptionRegistry.connect(owner).requestRedemption(gameTokenId))
      .to.be.revertedWithCustomError(fixture.registry, "InventoryTokenNotAnchored")
      .withArgs(gameTokenId);
  });

  it("rejects minting anchored physical token ids as game tokens before redemption", async function () {
    const fixture = await deployProtocolFixture();
    const { registry, itemToken, inventoryAdmin, minter, owner } = fixture;
    const inventoryId = "redemption-game-at-physical-id-001";
    const tokenId = physicalTokenIdFor(inventoryId);

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, inventoryHashFor(inventoryId), inventoryTokenUri, true, false);
    await expect(itemToken.connect(minter).mintGameItem(owner.address, tokenId, 1n, gameTokenUri))
      .to.be.revertedWithCustomError(itemToken, "InvalidGameTokenId")
      .withArgs(tokenId);
  });

  it("rejects direct ItemToken transfers outside redemption requests", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, redemptionRegistry, owner } = fixture;
    const tokenId = await anchorAndMintInventory(fixture, redeemableInventoryId, owner, true);

    await expect(
      itemToken
        .connect(owner)
        .safeTransferFrom(owner.address, await redemptionRegistry.getAddress(), tokenId, 1n, "0x")
    ).to.be.revertedWithCustomError(redemptionRegistry, "UnexpectedERC1155Received");

    expect(await itemToken.balanceOf(owner.address, tokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(await redemptionRegistry.getAddress(), tokenId)).to.equal(0n);
  });

  it("rejects batch ItemToken transfers", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, redemptionRegistry, minter, owner } = fixture;
    const firstTokenId = 22_001n;
    const secondTokenId = 22_002n;

    await itemToken.connect(minter).mintGameItem(owner.address, firstTokenId, 1n, gameTokenUri);
    await itemToken.connect(minter).mintGameItem(owner.address, secondTokenId, 1n, gameTokenUri);

    await expect(
      itemToken
        .connect(owner)
        .safeBatchTransferFrom(
          owner.address,
          await redemptionRegistry.getAddress(),
          [firstTokenId, secondTokenId],
          [1n, 1n],
          "0x"
        )
    ).to.be.revertedWithCustomError(redemptionRegistry, "UnexpectedERC1155BatchReceived");

    expect(await itemToken.balanceOf(owner.address, firstTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(owner.address, secondTokenId)).to.equal(1n);
  });

  it("returns escrowed tokens when cancelling packed and shipped requests", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, redemptionRegistry, redemptionAdmin, owner } = fixture;
    const packedTokenId = await anchorAndMintInventory(fixture, "redemption-cancel-packed-001", owner, true);
    const shippedTokenId = await anchorAndMintInventory(fixture, "redemption-cancel-shipped-001", owner, true);

    await itemToken.connect(owner).setApprovalForAll(await redemptionRegistry.getAddress(), true);
    await redemptionRegistry.connect(owner).requestRedemption(packedTokenId);
    await redemptionRegistry.connect(owner).requestRedemption(shippedTokenId);

    await redemptionRegistry.connect(redemptionAdmin).approve(1n);
    await redemptionRegistry.connect(redemptionAdmin).markPacked(1n);
    await redemptionRegistry.connect(redemptionAdmin).cancel(1n, cancelReason);

    await shipRequest(fixture, 2n);
    await redemptionRegistry.connect(redemptionAdmin).cancel(2n, cancelReason);

    expect((await redemptionRegistry.requests(1n)).status).to.equal(RedemptionStatus.Cancelled);
    expect((await redemptionRegistry.requests(2n)).status).to.equal(RedemptionStatus.Cancelled);
    expect(await itemToken.balanceOf(owner.address, packedTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(owner.address, shippedTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(await redemptionRegistry.getAddress(), packedTokenId)).to.equal(0n);
    expect(await itemToken.balanceOf(await redemptionRegistry.getAddress(), shippedTokenId)).to.equal(0n);
  });

  it("rejects cancelling completed requests and completing cancelled requests", async function () {
    const fixture = await deployProtocolFixture();
    const { redemptionRegistry, redemptionAdmin, owner } = fixture;
    const { requestId } = await requestRedeemableToken(fixture);

    await shipRequest(fixture, requestId);
    await redemptionRegistry.connect(redemptionAdmin).complete(requestId);

    await expect(redemptionRegistry.connect(redemptionAdmin).cancel(requestId, cancelReason))
      .to.be.revertedWithCustomError(redemptionRegistry, "InvalidStatusTransition")
      .withArgs(requestId, RedemptionStatus.Completed, RedemptionStatus.Cancelled);

    const secondTokenId = await anchorAndMintInventory(fixture, "redemption-cancelled-complete-001", owner, true);
    await fixture.itemToken
      .connect(owner)
      .setApprovalForAll(await redemptionRegistry.getAddress(), true);
    await redemptionRegistry.connect(owner).requestRedemption(secondTokenId);
    await redemptionRegistry.connect(redemptionAdmin).cancel(2n, cancelReason);

    await expect(redemptionRegistry.connect(redemptionAdmin).complete(2n))
      .to.be.revertedWithCustomError(redemptionRegistry, "InvalidStatusTransition")
      .withArgs(2n, RedemptionStatus.Cancelled, RedemptionStatus.Completed);
  });

  it("stores and emits shipped tracking references", async function () {
    const fixture = await deployProtocolFixture();
    const { redemptionRegistry, redemptionAdmin } = fixture;
    const { requestId } = await requestRedeemableToken(fixture);

    await redemptionRegistry.connect(redemptionAdmin).approve(requestId);
    await redemptionRegistry.connect(redemptionAdmin).markPacked(requestId);

    await expect(redemptionRegistry.connect(redemptionAdmin).markShipped(requestId, trackingRef))
      .to.emit(redemptionRegistry, "RedemptionShipped")
      .withArgs(requestId, trackingRef);

    expect((await redemptionRegistry.requests(requestId)).trackingRef).to.equal(trackingRef);
  });

  it("inherits ERC1155Holder so escrow transfers are accepted safely", async function () {
    const fixture = await deployProtocolFixture();
    const { itemToken, redemptionRegistry, owner } = fixture;
    const tokenId = await anchorAndMintInventory(fixture, redeemableInventoryId, owner, true);

    expect(await redemptionRegistry.supportsInterface(erc1155ReceiverInterfaceId)).to.equal(true);

    await itemToken.connect(owner).setApprovalForAll(await redemptionRegistry.getAddress(), true);
    await redemptionRegistry.connect(owner).requestRedemption(tokenId);

    expect(await itemToken.balanceOf(await redemptionRegistry.getAddress(), tokenId)).to.equal(1n);
  });

  it("rejects invalid status order", async function () {
    const fixture = await deployProtocolFixture();
    const { redemptionRegistry, redemptionAdmin } = fixture;
    const { requestId } = await requestRedeemableToken(fixture);

    await expect(redemptionRegistry.connect(redemptionAdmin).markPacked(requestId))
      .to.be.revertedWithCustomError(redemptionRegistry, "InvalidStatusTransition")
      .withArgs(requestId, RedemptionStatus.Requested, RedemptionStatus.Packed);
    await expect(redemptionRegistry.connect(redemptionAdmin).markShipped(requestId, trackingRef))
      .to.be.revertedWithCustomError(redemptionRegistry, "InvalidStatusTransition")
      .withArgs(requestId, RedemptionStatus.Requested, RedemptionStatus.Shipped);
    await expect(redemptionRegistry.connect(redemptionAdmin).complete(requestId))
      .to.be.revertedWithCustomError(redemptionRegistry, "InvalidStatusTransition")
      .withArgs(requestId, RedemptionStatus.Requested, RedemptionStatus.Completed);

    await redemptionRegistry.connect(redemptionAdmin).approve(requestId);

    await expect(redemptionRegistry.connect(redemptionAdmin).markShipped(requestId, trackingRef))
      .to.be.revertedWithCustomError(redemptionRegistry, "InvalidStatusTransition")
      .withArgs(requestId, RedemptionStatus.Approved, RedemptionStatus.Shipped);

    await redemptionRegistry.connect(redemptionAdmin).markPacked(requestId);

    await expect(redemptionRegistry.connect(redemptionAdmin).complete(requestId))
      .to.be.revertedWithCustomError(redemptionRegistry, "InvalidStatusTransition")
      .withArgs(requestId, RedemptionStatus.Packed, RedemptionStatus.Completed);
  });

  it("rejects empty shipped tracking refs and cancellation reasons", async function () {
    const fixture = await deployProtocolFixture();
    const { redemptionRegistry, redemptionAdmin } = fixture;
    const { requestId } = await requestRedeemableToken(fixture);

    await redemptionRegistry.connect(redemptionAdmin).approve(requestId);
    await redemptionRegistry.connect(redemptionAdmin).markPacked(requestId);

    await expect(redemptionRegistry.connect(redemptionAdmin).markShipped(requestId, ""))
      .to.be.revertedWithCustomError(redemptionRegistry, "EmptyTrackingRef");
    await expect(redemptionRegistry.connect(redemptionAdmin).cancel(requestId, ""))
      .to.be.revertedWithCustomError(redemptionRegistry, "EmptyCancellationReason");
  });

  it("rejects zero constructor addresses", async function () {
    const fixture = await deployProtocolFixture();
    const redemptionRegistryFactory = await ethers.getContractFactory("RedemptionRegistry");

    await expect(
      redemptionRegistryFactory.deploy(ethers.ZeroAddress, await fixture.registry.getAddress())
    ).to.be.revertedWithCustomError(redemptionRegistryFactory, "InvalidAddress");
    await expect(
      redemptionRegistryFactory.deploy(await fixture.itemToken.getAddress(), ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(redemptionRegistryFactory, "InvalidAddress");
  });
});
