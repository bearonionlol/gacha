import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocolFixture } from "./helpers/deploy";

const inventoryId = "sealed-case-001";
const inventoryTokenUri = "ipfs://items/sealed-case-001.json";
const gameTokenId = 5001n;
const gameTokenUri = "ipfs://items/game-item-5001.json";

function physicalTokenIdFor(id: string): bigint {
  return BigInt(ethers.keccak256(ethers.solidityPacked(["string", "string"], ["inventory:", id])));
}

const inventoryTokenId = physicalTokenIdFor(inventoryId);

describe("ItemToken", function () {
  it("mints a one-of-one inventory-backed token", async function () {
    const { itemToken, minter, owner } = await deployProtocolFixture();

    await expect(
      itemToken
        .connect(minter)
        .mintInventoryItem(owner.address, inventoryTokenId, inventoryId, inventoryTokenUri)
    )
      .to.emit(itemToken, "TransferSingle")
      .withArgs(minter.address, ethers.ZeroAddress, owner.address, inventoryTokenId, 1n);

    expect(await itemToken.balanceOf(owner.address, inventoryTokenId)).to.equal(1n);
    expect(await itemToken["totalSupply(uint256)"](inventoryTokenId)).to.equal(1n);
    expect(await itemToken.uri(inventoryTokenId)).to.equal(inventoryTokenUri);
  });

  it("rejects minting the same inventory-backed token twice", async function () {
    const { itemToken, minter, owner } = await deployProtocolFixture();

    await itemToken
      .connect(minter)
      .mintInventoryItem(owner.address, inventoryTokenId, inventoryId, inventoryTokenUri);

    await expect(
      itemToken
        .connect(minter)
        .mintInventoryItem(owner.address, inventoryTokenId, inventoryId, inventoryTokenUri)
    )
      .to.be.revertedWithCustomError(itemToken, "InventoryTokenAlreadyMinted")
      .withArgs(inventoryTokenId);
  });

  it("rejects inventory token id mismatches", async function () {
    const { itemToken, minter, owner } = await deployProtocolFixture();
    const mismatchedTokenId = inventoryTokenId + 1n;

    await expect(
      itemToken
        .connect(minter)
        .mintInventoryItem(owner.address, mismatchedTokenId, inventoryId, inventoryTokenUri)
    )
      .to.be.revertedWithCustomError(itemToken, "InventoryTokenIdMismatch")
      .withArgs(inventoryId, inventoryTokenId, mismatchedTokenId);
  });

  it("rejects invalid mint inputs", async function () {
    const { itemToken, minter, owner } = await deployProtocolFixture();

    await expect(
      itemToken
        .connect(minter)
        .mintInventoryItem(ethers.ZeroAddress, inventoryTokenId, inventoryId, inventoryTokenUri)
    ).to.be.revertedWithCustomError(itemToken, "ZeroRecipient");

    await expect(
      itemToken.connect(minter).mintGameItem(ethers.ZeroAddress, gameTokenId, 1n, gameTokenUri)
    ).to.be.revertedWithCustomError(itemToken, "ZeroRecipient");

    await expect(
      itemToken.connect(minter).mintInventoryItem(owner.address, 0n, "", inventoryTokenUri)
    ).to.be.revertedWithCustomError(itemToken, "EmptyInventoryId");
  });

  it("rejects the same inventory id under a different token id", async function () {
    const { itemToken, minter, owner, other } = await deployProtocolFixture();
    const mismatchedTokenId = inventoryTokenId + 1n;

    await itemToken
      .connect(minter)
      .mintInventoryItem(owner.address, inventoryTokenId, inventoryId, inventoryTokenUri);

    await expect(
      itemToken
        .connect(minter)
        .mintInventoryItem(other.address, mismatchedTokenId, inventoryId, inventoryTokenUri)
    )
      .to.be.revertedWithCustomError(itemToken, "InventoryTokenIdMismatch")
      .withArgs(inventoryId, inventoryTokenId, mismatchedTokenId);
  });

  it("mints fungible game items", async function () {
    const { itemToken, minter, owner, other } = await deployProtocolFixture();

    await itemToken.connect(minter).mintGameItem(owner.address, gameTokenId, 10n, gameTokenUri);
    await itemToken.connect(minter).mintGameItem(other.address, gameTokenId, 5n, "ipfs://ignored.json");

    expect(await itemToken.balanceOf(owner.address, gameTokenId)).to.equal(10n);
    expect(await itemToken.balanceOf(other.address, gameTokenId)).to.equal(5n);
    expect(await itemToken["totalSupply(uint256)"](gameTokenId)).to.equal(15n);
    expect(await itemToken.uri(gameTokenId)).to.equal(gameTokenUri);

    await expect(
      itemToken.connect(minter).mintGameItem(owner.address, gameTokenId + 1n, 0n, "")
    ).to.be.revertedWithCustomError(itemToken, "InvalidAmount");
  });

  it("rejects game minting an inventory token id", async function () {
    const { itemToken, minter, owner, other } = await deployProtocolFixture();

    await itemToken
      .connect(minter)
      .mintInventoryItem(owner.address, inventoryTokenId, inventoryId, inventoryTokenUri);

    await expect(
      itemToken.connect(minter).mintGameItem(other.address, inventoryTokenId, 1n, gameTokenUri)
    )
      .to.be.revertedWithCustomError(itemToken, "TokenKindConflict")
      .withArgs(inventoryTokenId);
  });

  it("rejects inventory minting a game token id", async function () {
    const { itemToken, minter, owner, other } = await deployProtocolFixture();
    const gameFirstInventoryId = "game-first-001";
    const gameFirstTokenId = physicalTokenIdFor(gameFirstInventoryId);

    await itemToken.connect(minter).mintGameItem(owner.address, gameFirstTokenId, 1n, gameTokenUri);

    await expect(
      itemToken
        .connect(minter)
        .mintInventoryItem(other.address, gameFirstTokenId, gameFirstInventoryId, inventoryTokenUri)
    )
      .to.be.revertedWithCustomError(itemToken, "TokenKindConflict")
      .withArgs(gameFirstTokenId);
  });

  it("lets the burner role burn user-approved items", async function () {
    const { itemToken, minter, burner, owner } = await deployProtocolFixture();

    await itemToken.connect(minter).mintGameItem(owner.address, gameTokenId, 4n, gameTokenUri);

    await expect(itemToken.connect(burner).burn(owner.address, gameTokenId, 1n))
      .to.be.revertedWithCustomError(itemToken, "BurnNotApproved")
      .withArgs(owner.address);

    await itemToken.connect(owner).setApprovalForAll(burner.address, true);

    await expect(itemToken.connect(burner).burn(owner.address, gameTokenId, 2n))
      .to.emit(itemToken, "TransferSingle")
      .withArgs(burner.address, owner.address, ethers.ZeroAddress, gameTokenId, 2n);

    expect(await itemToken.balanceOf(owner.address, gameTokenId)).to.equal(2n);
    expect(await itemToken["totalSupply(uint256)"](gameTokenId)).to.equal(2n);
  });

  it("stores token-specific URIs", async function () {
    const { itemToken, minter, uriSetter, owner } = await deployProtocolFixture();
    const updatedUri = "ipfs://items/game-item-5001-v2.json";

    await itemToken.connect(minter).mintGameItem(owner.address, gameTokenId, 1n, gameTokenUri);

    expect(await itemToken.uri(gameTokenId)).to.equal(gameTokenUri);

    await itemToken.connect(uriSetter).setTokenURI(gameTokenId, updatedUri);

    expect(await itemToken.uri(gameTokenId)).to.equal(updatedUri);
    expect(await itemToken.uri(gameTokenId + 1n)).to.equal("ipfs://gacha/items/{id}.json");
  });

  it("rejects empty token URI updates", async function () {
    const { itemToken, uriSetter } = await deployProtocolFixture();

    await expect(
      itemToken.connect(uriSetter).setTokenURI(gameTokenId, "")
    ).to.be.revertedWithCustomError(itemToken, "EmptyTokenURI");
  });

  it("pauses token transfers", async function () {
    const { itemToken, minter, owner, pauser, recipient } = await deployProtocolFixture();

    await itemToken.connect(minter).mintGameItem(owner.address, gameTokenId, 2n, gameTokenUri);
    await itemToken.connect(pauser).pause();

    await expect(
      itemToken
        .connect(owner)
        .safeTransferFrom(owner.address, recipient.address, gameTokenId, 1n, "0x")
    ).to.be.revertedWithCustomError(itemToken, "EnforcedPause");

    await itemToken.connect(pauser).unpause();
    await itemToken
      .connect(owner)
      .safeTransferFrom(owner.address, recipient.address, gameTokenId, 1n, "0x");

    expect(await itemToken.balanceOf(recipient.address, gameTokenId)).to.equal(1n);
  });

  it("pauses mint and burn token updates", async function () {
    const { itemToken, minter, burner, owner, other, pauser } = await deployProtocolFixture();

    await itemToken.connect(minter).mintGameItem(owner.address, gameTokenId, 2n, gameTokenUri);
    await itemToken.connect(owner).setApprovalForAll(burner.address, true);
    await itemToken.connect(pauser).pause();

    await expect(
      itemToken.connect(minter).mintGameItem(other.address, gameTokenId, 1n, gameTokenUri)
    ).to.be.revertedWithCustomError(itemToken, "EnforcedPause");

    await expect(
      itemToken.connect(burner).burn(owner.address, gameTokenId, 1n)
    ).to.be.revertedWithCustomError(itemToken, "EnforcedPause");
  });

  it("restricts role-gated item token operations", async function () {
    const { itemToken, minter, owner, other } = await deployProtocolFixture();

    await itemToken.connect(minter).mintGameItem(owner.address, gameTokenId, 1n, gameTokenUri);

    await expect(
      itemToken.connect(other).mintGameItem(owner.address, gameTokenId, 1n, gameTokenUri)
    )
      .to.be.revertedWithCustomError(itemToken, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await itemToken.MINTER_ROLE());

    await expect(itemToken.connect(other).burn(owner.address, gameTokenId, 1n))
      .to.be.revertedWithCustomError(itemToken, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await itemToken.BURNER_ROLE());

    await expect(itemToken.connect(other).setTokenURI(gameTokenId, "ipfs://items/blocked.json"))
      .to.be.revertedWithCustomError(itemToken, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await itemToken.URI_SETTER_ROLE());

    await expect(itemToken.connect(other).pause())
      .to.be.revertedWithCustomError(itemToken, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await itemToken.PAUSER_ROLE());
  });
});
