import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers } from "hardhat";
import { deployProtocolFixture, type CreateDropParams } from "./helpers/deploy";

const abiCoder = ethers.AbiCoder.defaultAbiCoder();
const dropName = "First Test Drop";
const packPrice = ethers.parseEther("0.05");
const firstInventoryId = "sealed-case-001";
const secondInventoryId = "sealed-case-002";
const thirdInventoryId = "sealed-case-003";
const firstMetadataUri = "ipfs://items/sealed-case-001.json";
const secondMetadataUri = "ipfs://items/sealed-case-002.json";
const thirdMetadataUri = "ipfs://items/sealed-case-003.json";
const inventoryIds = [firstInventoryId, secondInventoryId, thirdInventoryId];
const metadataUris = [firstMetadataUri, secondMetadataUri, thirdMetadataUri];

function inventoryHashFor(inventoryId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`inventory:${inventoryId}:v1`));
}

function physicalTokenIdFor(inventoryId: string): bigint {
  return BigInt(ethers.keccak256(ethers.solidityPacked(["string", "string"], ["inventory:", inventoryId])));
}

async function latestTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) {
    throw new Error("Missing latest block");
  }

  return block.timestamp;
}

async function setNextBlockTimestamp(timestamp: number): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

async function activeDropParams(overrides: Partial<CreateDropParams> = {}): Promise<CreateDropParams> {
  const now = await latestTimestamp();

  return {
    name: dropName,
    price: packPrice,
    startTime: now,
    endTime: now + 3600,
    maxSupply: 2n,
    inventoryIds,
    metadataUris,
    ...overrides
  };
}

async function anchorInventories(
  registry: Awaited<ReturnType<typeof deployProtocolFixture>>["registry"],
  inventoryAdmin: Awaited<ReturnType<typeof deployProtocolFixture>>["inventoryAdmin"],
  ids = inventoryIds,
  uris = metadataUris
): Promise<void> {
  for (const [index, inventoryId] of ids.entries()) {
    const metadataUri = uris[index];
    if (!metadataUri) {
      throw new Error(`Missing metadata URI for ${inventoryId}`);
    }

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, inventoryHashFor(inventoryId), metadataUri, true, false);
  }
}

async function createActiveDrop(): Promise<{
  fixture: Awaited<ReturnType<typeof deployProtocolFixture>>;
  dropId: bigint;
}> {
  const fixture = await deployProtocolFixture();
  const { registry, inventoryAdmin, packSale, dropAdmin } = fixture;

  await anchorInventories(registry, inventoryAdmin);

  await packSale.connect(dropAdmin).createDrop(await activeDropParams());

  return {
    fixture,
    dropId: 1n
  };
}

function requestIdFor(packSaleAddress: string, purchaseId: bigint, buyerAddress: string, chainId: bigint): string {
  return ethers.keccak256(
    abiCoder.encode(["address", "uint256", "address", "uint256"], [packSaleAddress, purchaseId, buyerAddress, chainId])
  );
}

function commitmentFor(seed: string): string {
  return ethers.keccak256(abiCoder.encode(["bytes32"], [seed]));
}

describe("PackSale", function () {
  it("creates a drop with anchored inventory entries", async function () {
    const { registry, inventoryAdmin, packSale, dropAdmin } = await deployProtocolFixture();

    await anchorInventories(registry, inventoryAdmin);

    await expect(packSale.connect(dropAdmin).createDrop(await activeDropParams()))
      .to.emit(packSale, "DropCreated")
      .withArgs(1n, dropName, packPrice, anyValue, anyValue, 2n, 3n);

    expect(await packSale.remainingInventory(1n)).to.equal(3n);
  });

  it("rejects drop creation with unanchored inventory", async function () {
    const { packSale, dropAdmin } = await deployProtocolFixture();

    await expect(packSale.connect(dropAdmin).createDrop(await activeDropParams()))
      .to.be.revertedWithCustomError(packSale, "UnanchoredInventory")
      .withArgs(firstInventoryId);
  });

  it("sells a pack for the configured native price", async function () {
    const {
      fixture: { packSale, buyer, treasury },
      dropId
    } = await createActiveDrop();
    const purchase = packSale.connect(buyer).purchase(dropId, { value: packPrice });

    await expect(purchase)
      .to.emit(packSale, "PackPurchased")
      .withArgs(1n, dropId, buyer.address, await requestIdForPack(packSale, 1n, buyer.address), packPrice);
    await expect(purchase).to.changeEtherBalance(treasury, packPrice);
  });

  it("rejects purchases outside the sale window", async function () {
    const { registry, inventoryAdmin, packSale, dropAdmin, buyer } = await deployProtocolFixture();
    const now = await latestTimestamp();

    await anchorInventories(registry, inventoryAdmin);
    await packSale.connect(dropAdmin).createDrop(
      await activeDropParams({
        startTime: now + 1000,
        endTime: now + 2000
      })
    );

    await expect(packSale.connect(buyer).purchase(1n, { value: packPrice }))
      .to.be.revertedWithCustomError(packSale, "InactiveSale")
      .withArgs(1n);

    await setNextBlockTimestamp(now + 2001);

    await expect(packSale.connect(buyer).purchase(1n, { value: packPrice }))
      .to.be.revertedWithCustomError(packSale, "InactiveSale")
      .withArgs(1n);
  });

  it("reveals a purchased pack after randomness is ready", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, buyer, revealer } = fixture;
    const seed = ethers.keccak256(ethers.toUtf8Bytes("sale-reveal-seed"));

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);

    await expect(packSale.connect(buyer).reveal(1n)).to.be.revertedWithCustomError(packSale, "RandomnessNotReady");

    await randomnessProvider.connect(revealer).commitRandomness(requestId, commitmentFor(seed));
    await randomnessProvider.connect(revealer).revealRandomness(requestId, seed);

    await expect(packSale.connect(buyer).reveal(1n)).to.emit(packSale, "PackRevealed");
  });

  it("mints the revealed inventory token to the buyer", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, itemToken, buyer, revealer } = fixture;
    const selectedInventoryId = firstInventoryId;
    const seed = await seedForInventoryIndex(
      randomnessProvider,
      await requestIdForPack(packSale, 1n, buyer.address),
      0n
    );
    const tokenId = physicalTokenIdFor(selectedInventoryId);

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);
    await randomnessProvider.connect(revealer).commitRandomness(requestId, commitmentFor(seed));
    await randomnessProvider.connect(revealer).revealRandomness(requestId, seed);

    await expect(packSale.connect(buyer).reveal(1n))
      .to.emit(itemToken, "TransferSingle")
      .withArgs(await packSale.getAddress(), ethers.ZeroAddress, buyer.address, tokenId, 1n);

    expect(await itemToken.balanceOf(buyer.address, tokenId)).to.equal(1n);
    expect(await itemToken.uri(tokenId)).to.equal(firstMetadataUri);
  });

  it("removes revealed inventory from the drop pool", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, buyer, revealer } = fixture;
    const seed = ethers.keccak256(ethers.toUtf8Bytes("remove-inventory-seed"));

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);
    await randomnessProvider.connect(revealer).commitRandomness(requestId, commitmentFor(seed));
    await randomnessProvider.connect(revealer).revealRandomness(requestId, seed);

    expect(await packSale.remainingInventory(dropId)).to.equal(3n);

    await packSale.connect(buyer).reveal(1n);

    expect(await packSale.remainingInventory(dropId)).to.equal(2n);
  });

  it("forwards pack payments to the treasury", async function () {
    const {
      fixture: { packSale, buyer, treasury },
      dropId
    } = await createActiveDrop();

    await expect(packSale.connect(buyer).purchase(dropId, { value: packPrice })).to.changeEtherBalance(
      treasury,
      packPrice
    );
  });
});

async function requestIdForPack(
  packSale: Awaited<ReturnType<typeof deployProtocolFixture>>["packSale"],
  purchaseId: bigint,
  buyerAddress: string
): Promise<string> {
  const network = await ethers.provider.getNetwork();

  return requestIdFor(await packSale.getAddress(), purchaseId, buyerAddress, network.chainId);
}

async function seedForInventoryIndex(
  randomnessProvider: Awaited<ReturnType<typeof deployProtocolFixture>>["randomnessProvider"],
  requestId: string,
  targetIndex: bigint
): Promise<string> {
  for (let attempt = 0n; attempt < 256n; attempt += 1n) {
    const candidate = ethers.keccak256(abiCoder.encode(["string", "uint256"], ["pack-seed", attempt]));
    const randomness = BigInt(
      ethers.keccak256(
        abiCoder.encode(["bytes32", "bytes32", "address"], [candidate, requestId, await randomnessProvider.getAddress()])
      )
    );

    if (randomness % BigInt(inventoryIds.length) === targetIndex) {
      return candidate;
    }
  }

  throw new Error(`Could not find seed for inventory index ${targetIndex}`);
}
