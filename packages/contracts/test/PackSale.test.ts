import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers } from "hardhat";
import type { BaseContract, BigNumberish, ContractRunner, ContractTransactionResponse } from "ethers";
import { deployProtocolFixture, type CreateDropParams, type PackSale } from "./helpers/deploy";

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
const requesterRole = ethers.id("REQUESTER_ROLE");
const refundTimeoutSeconds = 24 * 60 * 60;

type RejectingPackBuyer = Omit<BaseContract, "connect"> & {
  purchasePack(
    packSale: string,
    dropId: BigNumberish,
    overrides?: { value?: BigNumberish }
  ): Promise<ContractTransactionResponse>;
  claimRevealedTokenTo(
    packSale: string,
    purchaseId: BigNumberish,
    to: string
  ): Promise<ContractTransactionResponse>;
  withdrawRefund(packSale: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): RejectingPackBuyer;
};

type RejectingNativeParticipant = BaseContract;

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

async function increaseTime(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
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

async function createActiveDrop(overrides: Partial<CreateDropParams> = {}): Promise<{
  fixture: Awaited<ReturnType<typeof deployProtocolFixture>>;
  dropId: bigint;
}> {
  const fixture = await deployProtocolFixture();
  const { registry, inventoryAdmin, packSale, dropAdmin } = fixture;

  await anchorInventories(registry, inventoryAdmin);

  await packSale.connect(dropAdmin).createDrop(await activeDropParams(overrides));

  return {
    fixture,
    dropId: 1n
  };
}

async function deployRejectingPackBuyer(): Promise<RejectingPackBuyer> {
  const rejectingBuyer = (await ethers.deployContract("RejectingPackBuyer")) as unknown as RejectingPackBuyer;
  await rejectingBuyer.waitForDeployment();

  return rejectingBuyer;
}

async function deployRejectingNativeParticipant(): Promise<RejectingNativeParticipant> {
  const rejectingParticipant = await ethers.deployContract("RejectingNativeParticipant");
  await rejectingParticipant.waitForDeployment();

  return rejectingParticipant;
}

async function createActiveDropWithTreasury(treasuryAddress: string): Promise<{
  fixture: Awaited<ReturnType<typeof deployProtocolFixture>>;
  dropId: bigint;
}> {
  const fixture = await deployProtocolFixture();
  const { registry, inventoryAdmin, itemToken, randomnessProvider, dropAdmin } = fixture;
  const packSale = (await ethers.deployContract("PackSale", [
    await registry.getAddress(),
    await itemToken.getAddress(),
    await randomnessProvider.getAddress(),
    treasuryAddress
  ])) as unknown as PackSale;
  await packSale.waitForDeployment();

  await registry.grantRole(await registry.TOKENIZER_ROLE(), await packSale.getAddress());
  await itemToken.grantRole(await itemToken.MINTER_ROLE(), await packSale.getAddress());
  await randomnessProvider.grantRole(await randomnessProvider.REQUESTER_ROLE(), await packSale.getAddress());
  await packSale.grantRole(await packSale.DROP_ADMIN_ROLE(), dropAdmin.address);

  await anchorInventories(registry, inventoryAdmin);
  await packSale.connect(dropAdmin).createDrop(await activeDropParams({ maxSupply: 1n }));

  return {
    fixture: {
      ...fixture,
      packSale: packSale as unknown as Awaited<ReturnType<typeof deployProtocolFixture>>["packSale"]
    },
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

async function makeRandomnessReady(
  randomnessProvider: Awaited<ReturnType<typeof deployProtocolFixture>>["randomnessProvider"],
  revealer: Awaited<ReturnType<typeof deployProtocolFixture>>["revealer"],
  requestId: string,
  seed: string
): Promise<void> {
  await randomnessProvider.connect(revealer).commitRandomness(requestId, commitmentFor(seed));
  await randomnessProvider.connect(revealer).revealRandomness(requestId, seed);
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

  it("rejects drop creation with duplicate inventory IDs", async function () {
    const { registry, inventoryAdmin, packSale, dropAdmin } = await deployProtocolFixture();

    await anchorInventories(registry, inventoryAdmin, [firstInventoryId], [firstMetadataUri]);

    await expect(
      packSale.connect(dropAdmin).createDrop(
        await activeDropParams({
          maxSupply: 1n,
          inventoryIds: [firstInventoryId, firstInventoryId],
          metadataUris: [firstMetadataUri, secondMetadataUri]
        })
      )
    )
      .to.be.revertedWithCustomError(packSale, "DuplicateInventory")
      .withArgs(firstInventoryId);
  });

  it("rejects drop creation with already-tokenized inventory", async function () {
    const { registry, inventoryAdmin, tokenizer, owner, packSale, dropAdmin } = await deployProtocolFixture();

    await anchorInventories(registry, inventoryAdmin, [firstInventoryId], [firstMetadataUri]);
    await registry.connect(tokenizer).markTokenized(firstInventoryId, owner.address);

    await expect(
      packSale.connect(dropAdmin).createDrop(
        await activeDropParams({
          maxSupply: 1n,
          inventoryIds: [firstInventoryId],
          metadataUris: [firstMetadataUri]
        })
      )
    )
      .to.be.revertedWithCustomError(packSale, "InventoryAlreadyTokenized")
      .withArgs(firstInventoryId);
  });

  it("rejects cross-drop inventory reuse while reserved", async function () {
    const { registry, inventoryAdmin, packSale, dropAdmin } = await deployProtocolFixture();

    await anchorInventories(registry, inventoryAdmin);
    await packSale.connect(dropAdmin).createDrop(await activeDropParams());

    await expect(
      packSale.connect(dropAdmin).createDrop(
        await activeDropParams({
          maxSupply: 1n,
          inventoryIds: [firstInventoryId],
          metadataUris: [firstMetadataUri]
        })
      )
    )
      .to.be.revertedWithCustomError(packSale, "InventoryAlreadyReserved")
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
    await expect(purchase).to.changeEtherBalances([packSale, treasury], [packPrice, 0n]);
  });

  it("rejects wrong pack payments", async function () {
    const {
      fixture: { packSale, buyer },
      dropId
    } = await createActiveDrop();
    const shortPayment = packPrice - 1n;

    await expect(packSale.connect(buyer).purchase(dropId, { value: shortPayment }))
      .to.be.revertedWithCustomError(packSale, "ExactPaymentRequired")
      .withArgs(packPrice, shortPayment);
  });

  it("rejects sold out purchases", async function () {
    const {
      fixture: { packSale, buyer, recipient },
      dropId
    } = await createActiveDrop({ maxSupply: 1n });

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });

    await expect(packSale.connect(recipient).purchase(dropId, { value: packPrice }))
      .to.be.revertedWithCustomError(packSale, "SoldOut")
      .withArgs(dropId);
  });

  it("rejects purchases while paused", async function () {
    const {
      fixture: { packSale, dropAdmin, buyer },
      dropId
    } = await createActiveDrop();

    await packSale.connect(dropAdmin).pause();

    await expect(packSale.connect(buyer).purchase(dropId, { value: packPrice })).to.be.revertedWithCustomError(
      packSale,
      "EnforcedPause"
    );
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

  it("prevents untrusted request ID squatting before purchase", async function () {
    const {
      fixture: { packSale, randomnessProvider, buyer, other },
      dropId
    } = await createActiveDrop();
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);

    await expect(randomnessProvider.connect(other).requestRandomness(requestId))
      .to.be.revertedWithCustomError(randomnessProvider, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, requesterRole);

    await expect(packSale.connect(buyer).purchase(dropId, { value: packPrice }))
      .to.emit(packSale, "PackPurchased")
      .withArgs(1n, dropId, buyer.address, requestId, packPrice);
  });

  it("reveals a purchased pack after randomness is ready", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, buyer, revealer } = fixture;
    const seed = ethers.keccak256(ethers.toUtf8Bytes("sale-reveal-seed"));

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);

    await expect(packSale.connect(buyer).reveal(1n)).to.be.revertedWithCustomError(packSale, "RandomnessNotReady");

    await makeRandomnessReady(randomnessProvider, revealer, requestId, seed);

    await expect(packSale.connect(buyer).reveal(1n)).to.emit(packSale, "PackRevealed");
  });

  it("rejects unauthorized reveals", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, buyer, other, revealer } = fixture;
    const seed = ethers.keccak256(ethers.toUtf8Bytes("unauthorized-reveal-seed"));

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);
    await makeRandomnessReady(randomnessProvider, revealer, requestId, seed);

    await expect(packSale.connect(other).reveal(1n))
      .to.be.revertedWithCustomError(packSale, "UnauthorizedReveal")
      .withArgs(1n, other.address);
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
    await makeRandomnessReady(randomnessProvider, revealer, requestId, seed);

    await expect(packSale.connect(buyer).reveal(1n)).to.emit(packSale, "PackRevealed");

    expect(await itemToken.balanceOf(buyer.address, tokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(await packSale.getAddress(), tokenId)).to.equal(0n);
    expect(await itemToken.uri(tokenId)).to.equal(firstMetadataUri);
  });

  it("rejects double reveals", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, buyer, revealer } = fixture;
    const seed = ethers.keccak256(ethers.toUtf8Bytes("double-reveal-seed"));

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);
    await makeRandomnessReady(randomnessProvider, revealer, requestId, seed);
    await packSale.connect(buyer).reveal(1n);

    await expect(packSale.connect(buyer).reveal(1n))
      .to.be.revertedWithCustomError(packSale, "PurchaseAlreadyRevealed")
      .withArgs(1n);
  });

  it("removes revealed inventory from the drop pool", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, buyer, revealer } = fixture;
    const seed = ethers.keccak256(ethers.toUtf8Bytes("remove-inventory-seed"));

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);
    await makeRandomnessReady(randomnessProvider, revealer, requestId, seed);

    expect(await packSale.remainingInventory(dropId)).to.equal(3n);

    await packSale.connect(buyer).reveal(1n);

    expect(await packSale.remainingInventory(dropId)).to.equal(2n);
  });

  it("credits pack revenue to treasury after reveal and lets anyone withdraw it to treasury", async function () {
    const {
      fixture: { packSale, randomnessProvider, buyer, treasury, revealer, other },
      dropId
    } = await createActiveDrop();
    const seed = ethers.keccak256(ethers.toUtf8Bytes("treasury-forward-seed"));

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);
    await makeRandomnessReady(randomnessProvider, revealer, requestId, seed);

    await expect(packSale.connect(buyer).reveal(1n))
      .to.emit(packSale, "TreasuryCreditRecorded")
      .withArgs(treasury.address, packPrice, packPrice);
    expect(await packSale.treasuryCredit()).to.equal(packPrice);

    const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);
    const packSaleBalanceBefore = await ethers.provider.getBalance(await packSale.getAddress());
    const withdrawal = await packSale.connect(other).withdrawTreasuryCredit();
    await expect(withdrawal)
      .to.emit(packSale, "TreasuryCreditWithdrawn")
      .withArgs(other.address, treasury.address, packPrice);
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(treasuryBalanceBefore + packPrice);
    expect(await ethers.provider.getBalance(await packSale.getAddress())).to.equal(packSaleBalanceBefore - packPrice);
    expect(await packSale.treasuryCredit()).to.equal(0n);
  });

  it("does not let a native-rejecting treasury block reveal or drop closure", async function () {
    const rejectingTreasury = await deployRejectingNativeParticipant();
    const rejectingTreasuryAddress = await rejectingTreasury.getAddress();
    const { fixture, dropId } = await createActiveDropWithTreasury(rejectingTreasuryAddress);
    const { packSale, randomnessProvider, buyer, dropAdmin, revealer } = fixture;
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);
    const seed = await seedForInventoryIndex(randomnessProvider, requestId, 0n);

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await makeRandomnessReady(randomnessProvider, revealer, requestId, seed);

    await expect(packSale.connect(buyer).reveal(1n))
      .to.emit(packSale, "TreasuryCreditRecorded")
      .withArgs(rejectingTreasuryAddress, packPrice, packPrice);
    expect(await packSale.treasuryCredit()).to.equal(packPrice);

    await increaseTime(3601);
    await expect(packSale.connect(dropAdmin).closeDrop(dropId)).to.emit(packSale, "DropClosed");
  });

  it("preserves treasury credit when treasury withdrawal fails and lets admin recover to another recipient", async function () {
    const rejectingTreasury = await deployRejectingNativeParticipant();
    const rejectingTreasuryAddress = await rejectingTreasury.getAddress();
    const { fixture, dropId } = await createActiveDropWithTreasury(rejectingTreasuryAddress);
    const { packSale, randomnessProvider, buyer, deployer, other, recipient, revealer } = fixture;
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);
    const seed = await seedForInventoryIndex(randomnessProvider, requestId, 0n);

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await makeRandomnessReady(randomnessProvider, revealer, requestId, seed);
    await packSale.connect(buyer).reveal(1n);

    await expect(packSale.connect(other).withdrawTreasuryCredit())
      .to.be.revertedWithCustomError(packSale, "TransferFailed")
      .withArgs(rejectingTreasuryAddress, packPrice);
    expect(await packSale.treasuryCredit()).to.equal(packPrice);

    const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);
    const packSaleBalanceBefore = await ethers.provider.getBalance(await packSale.getAddress());
    const recovery = await packSale.connect(deployer).withdrawTreasuryCreditTo(recipient.address);
    await expect(recovery)
      .to.emit(packSale, "TreasuryCreditWithdrawn")
      .withArgs(deployer.address, recipient.address, packPrice);
    expect(await ethers.provider.getBalance(recipient.address)).to.equal(recipientBalanceBefore + packPrice);
    expect(await ethers.provider.getBalance(await packSale.getAddress())).to.equal(packSaleBalanceBefore - packPrice);
    expect(await packSale.treasuryCredit()).to.equal(0n);

    await expect(packSale.connect(deployer).withdrawTreasuryCreditTo(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(packSale, "InvalidAddress");
  });

  it("blocks later purchase reveals until earlier purchases reveal", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, buyer, recipient, revealer } = fixture;
    const firstSeed = ethers.keccak256(ethers.toUtf8Bytes("first-order-seed"));
    const secondSeed = ethers.keccak256(ethers.toUtf8Bytes("second-order-seed"));

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await packSale.connect(recipient).purchase(dropId, { value: packPrice });
    await makeRandomnessReady(randomnessProvider, revealer, await requestIdForPack(packSale, 1n, buyer.address), firstSeed);
    await makeRandomnessReady(
      randomnessProvider,
      revealer,
      await requestIdForPack(packSale, 2n, recipient.address),
      secondSeed
    );

    await expect(packSale.connect(recipient).reveal(2n))
      .to.be.revertedWithCustomError(packSale, "RevealOrderBlocked")
      .withArgs(2n, 0n, 1n);

    await packSale.connect(buyer).reveal(1n);
    await expect(packSale.connect(recipient).reveal(2n)).to.emit(packSale, "PackRevealed");
  });

  it("lets anyone reveal a timed-out ready purchase for the original buyer", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, itemToken, buyer, recipient, other, revealer } = fixture;
    const firstRequestId = await requestIdForPack(packSale, 1n, buyer.address);
    const secondRequestId = await requestIdForPack(packSale, 2n, recipient.address);
    const firstSeed = await seedForInventoryIndex(randomnessProvider, firstRequestId, 0n);
    const secondSeed = ethers.keccak256(ethers.toUtf8Bytes("keeper-second-seed"));
    const firstTokenId = physicalTokenIdFor(firstInventoryId);

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await packSale.connect(recipient).purchase(dropId, { value: packPrice });
    await makeRandomnessReady(randomnessProvider, revealer, firstRequestId, firstSeed);
    await makeRandomnessReady(randomnessProvider, revealer, secondRequestId, secondSeed);
    await increaseTime(refundTimeoutSeconds + 1);

    await expect(packSale.connect(other).reveal(1n)).to.emit(packSale, "PackRevealed");

    expect(await itemToken.balanceOf(buyer.address, firstTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(await packSale.getAddress(), firstTokenId)).to.equal(0n);
    await expect(packSale.connect(recipient).reveal(2n)).to.emit(packSale, "PackRevealed");
  });

  it("escrows revealed tokens for non-receiver buyers without blocking later resolution", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, itemToken, recipient, other, dropAdmin, revealer } = fixture;
    const rejectingBuyer = await deployRejectingPackBuyer();
    const rejectingBuyerAddress = await rejectingBuyer.getAddress();
    const packSaleAddress = await packSale.getAddress();
    const firstRequestId = await requestIdForPack(packSale, 1n, rejectingBuyerAddress);
    const secondRequestId = await requestIdForPack(packSale, 2n, recipient.address);
    const firstSeed = await seedForInventoryIndex(randomnessProvider, firstRequestId, 0n);
    const secondSeed = ethers.keccak256(ethers.toUtf8Bytes("non-receiver-second-seed"));
    const firstTokenId = physicalTokenIdFor(firstInventoryId);

    await rejectingBuyer.purchasePack(packSaleAddress, dropId, { value: packPrice });
    await packSale.connect(recipient).purchase(dropId, { value: packPrice });
    await makeRandomnessReady(randomnessProvider, revealer, firstRequestId, firstSeed);
    await makeRandomnessReady(randomnessProvider, revealer, secondRequestId, secondSeed);
    await increaseTime(refundTimeoutSeconds + 1);

    await expect(packSale.connect(other).reveal(1n)).to.emit(packSale, "PackRevealed");

    expect(await itemToken.balanceOf(packSaleAddress, firstTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(rejectingBuyerAddress, firstTokenId)).to.equal(0n);

    await expect(packSale.connect(recipient).reveal(2n)).to.emit(packSale, "PackRevealed");
    await expect(packSale.connect(dropAdmin).closeDrop(dropId)).to.emit(packSale, "DropClosed");

    await expect(packSale.connect(other).claimRevealedTokenTo(1n, other.address))
      .to.be.revertedWithCustomError(packSale, "UnauthorizedClaim")
      .withArgs(1n, other.address);

    await expect(rejectingBuyer.claimRevealedTokenTo(packSaleAddress, 1n, other.address))
      .to.emit(itemToken, "TransferSingle")
      .withArgs(packSaleAddress, packSaleAddress, other.address, firstTokenId, 1n);
    expect(await itemToken.balanceOf(other.address, firstTokenId)).to.equal(1n);
  });

  it("rejects refunds before the timeout", async function () {
    const {
      fixture: { packSale, buyer },
      dropId
    } = await createActiveDrop();

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });

    await expect(packSale.connect(buyer).refundExpiredPurchase(1n))
      .to.be.revertedWithCustomError(packSale, "RefundNotAvailable")
      .withArgs(1n);
  });

  it("lets anyone refund an expired purchase only to the original buyer when randomness is not ready", async function () {
    const {
      fixture: { packSale, buyer, other },
      dropId
    } = await createActiveDrop();

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await increaseTime(refundTimeoutSeconds + 1);

    await expect(packSale.connect(other).refundExpiredPurchase(1n)).to.changeEtherBalances(
      [buyer, packSale],
      [0n, 0n]
    );
    expect(await packSale.refundCredit(buyer.address)).to.equal(packPrice);

    await expect(packSale.connect(buyer).withdrawRefund()).to.changeEtherBalances(
      [buyer, packSale],
      [packPrice, -packPrice]
    );
    expect(await packSale.refundCredit(buyer.address)).to.equal(0n);

    await expect(packSale.connect(buyer).refundExpiredPurchase(1n))
      .to.be.revertedWithCustomError(packSale, "PurchaseAlreadyRefunded")
      .withArgs(1n);
  });

  it("rejects refunds after randomness is ready", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, buyer, other, revealer } = fixture;
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);
    const seed = ethers.keccak256(ethers.toUtf8Bytes("ready-refund-seed"));

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await makeRandomnessReady(randomnessProvider, revealer, requestId, seed);
    await increaseTime(refundTimeoutSeconds + 1);

    await expect(packSale.connect(other).refundExpiredPurchase(1n))
      .to.be.revertedWithCustomError(packSale, "RefundRandomnessReady")
      .withArgs(1n);
  });

  it("lets the buyer refund an unrevealed purchase after timeout", async function () {
    const {
      fixture: { packSale, buyer },
      dropId
    } = await createActiveDrop();

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await increaseTime(refundTimeoutSeconds + 1);

    await expect(packSale.connect(buyer).refundExpiredPurchase(1n)).to.changeEtherBalances(
      [buyer, packSale],
      [0n, 0n]
    );
    expect(await packSale.refundCredit(buyer.address)).to.equal(packPrice);

    await expect(packSale.connect(buyer).withdrawRefund()).to.changeEtherBalances(
      [buyer, packSale],
      [packPrice, -packPrice]
    );

    await expect(packSale.connect(buyer).refundExpiredPurchase(1n))
      .to.be.revertedWithCustomError(packSale, "PurchaseAlreadyRefunded")
      .withArgs(1n);
  });

  it("credits refunds for native-rejecting buyers without blocking drop closure", async function () {
    const { fixture, dropId } = await createActiveDrop({ maxSupply: 1n });
    const { packSale, other, dropAdmin } = fixture;
    const rejectingBuyer = await deployRejectingPackBuyer();
    const rejectingBuyerAddress = await rejectingBuyer.getAddress();
    const packSaleAddress = await packSale.getAddress();

    await rejectingBuyer.purchasePack(packSaleAddress, dropId, { value: packPrice });
    await increaseTime(refundTimeoutSeconds + 1);

    await expect(packSale.connect(other).refundExpiredPurchase(1n)).to.emit(packSale, "PackRefunded");
    expect(await packSale.refundCredit(rejectingBuyerAddress)).to.equal(packPrice);
    await expect(packSale.connect(dropAdmin).closeDrop(dropId)).to.emit(packSale, "DropClosed");
  });

  it("lets a replacement buyer purchase after an expired refund frees supply", async function () {
    const now = await latestTimestamp();
    const {
      fixture: { packSale, buyer, recipient },
      dropId
    } = await createActiveDrop({ maxSupply: 1n, endTime: now + refundTimeoutSeconds + 3600 });

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await increaseTime(refundTimeoutSeconds + 1);
    await packSale.connect(buyer).refundExpiredPurchase(1n);

    await expect(packSale.connect(recipient).purchase(dropId, { value: packPrice }))
      .to.emit(packSale, "PackPurchased")
      .withArgs(2n, dropId, recipient.address, await requestIdForPack(packSale, 2n, recipient.address), packPrice);
  });

  it("advances reveal order when refunding the next expected purchase", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, randomnessProvider, buyer, recipient, revealer } = fixture;
    const secondSeed = ethers.keccak256(ethers.toUtf8Bytes("refund-order-seed"));

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await packSale.connect(recipient).purchase(dropId, { value: packPrice });
    await makeRandomnessReady(
      randomnessProvider,
      revealer,
      await requestIdForPack(packSale, 2n, recipient.address),
      secondSeed
    );
    await increaseTime(refundTimeoutSeconds + 1);

    await packSale.connect(buyer).refundExpiredPurchase(1n);

    await expect(packSale.connect(recipient).reveal(2n)).to.emit(packSale, "PackRevealed");
  });

  it("rejects closing a drop while pending purchases remain", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { packSale, buyer, dropAdmin } = fixture;
    const now = await latestTimestamp();

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await setNextBlockTimestamp(now + 3601);

    await expect(packSale.connect(dropAdmin).closeDrop(dropId))
      .to.be.revertedWithCustomError(packSale, "PendingPurchasesRemaining")
      .withArgs(dropId);
  });

  it("closes a resolved ended drop and releases unused inventory reservations", async function () {
    const { fixture, dropId } = await createActiveDrop({ maxSupply: 1n });
    const { packSale, buyer, dropAdmin } = fixture;

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await increaseTime(refundTimeoutSeconds + 1);
    await packSale.connect(buyer).refundExpiredPurchase(1n);

    await expect(packSale.connect(dropAdmin).closeDrop(dropId))
      .to.emit(packSale, "DropClosed")
      .withArgs(dropId, 3n);

    expect(await packSale.remainingInventory(dropId)).to.equal(0n);

    await expect(
      packSale.connect(dropAdmin).createDrop(
        await activeDropParams({
          maxSupply: 1n,
          inventoryIds: [firstInventoryId],
          metadataUris: [firstMetadataUri]
        })
      )
    ).to.emit(packSale, "DropCreated");
  });

  it("keeps registry and escrow unchanged when token minting fails during reveal", async function () {
    const { fixture, dropId } = await createActiveDrop();
    const { registry, itemToken, packSale, randomnessProvider, buyer, revealer } = fixture;
    const requestId = await requestIdForPack(packSale, 1n, buyer.address);
    const seed = await seedForInventoryIndex(randomnessProvider, requestId, 0n);

    await packSale.connect(buyer).purchase(dropId, { value: packPrice });
    await makeRandomnessReady(randomnessProvider, revealer, requestId, seed);
    await itemToken.revokeRole(await itemToken.MINTER_ROLE(), await packSale.getAddress());

    await expect(packSale.connect(buyer).reveal(1n))
      .to.be.revertedWithCustomError(itemToken, "AccessControlUnauthorizedAccount")
      .withArgs(await packSale.getAddress(), await itemToken.MINTER_ROLE());

    const record = await registry.getInventory(firstInventoryId);
    expect(record.tokenized).to.equal(false);
    expect(record.owner).to.equal(ethers.ZeroAddress);
    expect(await packSale.remainingInventory(dropId)).to.equal(3n);
    expect(await ethers.provider.getBalance(await packSale.getAddress())).to.equal(packPrice);

    await expect(
      packSale.connect(fixture.dropAdmin).createDrop(
        await activeDropParams({
          maxSupply: 1n,
          inventoryIds: [firstInventoryId],
          metadataUris: [firstMetadataUri]
        })
      )
    )
      .to.be.revertedWithCustomError(packSale, "InventoryAlreadyReserved")
      .withArgs(firstInventoryId);
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
