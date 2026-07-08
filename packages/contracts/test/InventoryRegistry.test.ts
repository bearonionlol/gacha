import { expect } from "chai";
import { ethers } from "hardhat";
import { deployInventoryRegistryFixture } from "./helpers/deploy";

const inventoryId = "sealed-case-001";
const metadataUri = "ipfs://inventory/sealed-case-001.json";
const inventoryHash = ethers.keccak256(ethers.toUtf8Bytes("inventory:sealed-case-001:v1"));

function physicalTokenIdFor(id: string): bigint {
  return BigInt(ethers.keccak256(ethers.solidityPacked(["string", "string"], ["inventory:", id])));
}

describe("InventoryRegistry", function () {
  it("derives stable physical token ids from inventory ids", async function () {
    const { registry } = await deployInventoryRegistryFixture();

    const derived = await registry.derivePhysicalTokenId(inventoryId);

    expect(derived).to.equal(physicalTokenIdFor(inventoryId));
    expect(await registry.derivePhysicalTokenId(inventoryId)).to.equal(derived);
    expect(await registry.derivePhysicalTokenId("sealed-case-002")).to.not.equal(derived);
  });

  it("anchors an inventory hash once", async function () {
    const { registry, inventoryAdmin } = await deployInventoryRegistryFixture();
    const tokenId = physicalTokenIdFor(inventoryId);

    await expect(
      registry
        .connect(inventoryAdmin)
        .anchorInventory(inventoryId, inventoryHash, metadataUri, true, false)
    )
      .to.emit(registry, "InventoryAnchored")
      .withArgs(inventoryId, inventoryHash, tokenId, metadataUri, true, false);

    const record = await registry.getInventory(inventoryId);
    expect(record.inventoryId).to.equal(inventoryId);
    expect(record.inventoryHash).to.equal(inventoryHash);
    expect(record.metadataUri).to.equal(metadataUri);
    expect(record.redeemable).to.equal(true);
    expect(record.grailProtected).to.equal(false);
    expect(record.tokenId).to.equal(tokenId);
    expect(record.tokenized).to.equal(false);
    expect(record.owner).to.equal(ethers.ZeroAddress);
  });

  it("rejects duplicate inventory anchors", async function () {
    const { registry, inventoryAdmin } = await deployInventoryRegistryFixture();

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, inventoryHash, metadataUri, true, false);

    await expect(
      registry
        .connect(inventoryAdmin)
        .anchorInventory(inventoryId, inventoryHash, metadataUri, true, false)
    )
      .to.be.revertedWithCustomError(registry, "InventoryAlreadyAnchored")
      .withArgs(inventoryId);
  });

  it("rejects invalid inventory anchor inputs", async function () {
    const { registry, inventoryAdmin } = await deployInventoryRegistryFixture();

    await expect(
      registry.connect(inventoryAdmin).anchorInventory("", inventoryHash, metadataUri, true, false)
    ).to.be.revertedWithCustomError(registry, "EmptyInventoryId");

    await expect(
      registry.connect(inventoryAdmin).anchorInventory(inventoryId, ethers.ZeroHash, metadataUri, true, false)
    ).to.be.revertedWithCustomError(registry, "ZeroInventoryHash");
  });

  it("restricts anchoring to the inventory admin role", async function () {
    const { registry, other } = await deployInventoryRegistryFixture();

    await expect(
      registry.connect(other).anchorInventory(inventoryId, inventoryHash, metadataUri, true, false)
    )
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await registry.INVENTORY_ADMIN_ROLE());
  });

  it("marks anchored inventory as tokenized through the tokenizer role", async function () {
    const { registry, inventoryAdmin, tokenizer, owner, other } = await deployInventoryRegistryFixture();
    const tokenId = physicalTokenIdFor(inventoryId);

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, inventoryHash, metadataUri, true, false);

    await expect(registry.connect(other).markTokenized(inventoryId, owner.address))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await registry.TOKENIZER_ROLE());

    await expect(registry.connect(tokenizer).markTokenized(inventoryId, owner.address))
      .to.emit(registry, "InventoryTokenized")
      .withArgs(inventoryId, tokenId, owner.address);

    const record = await registry.getInventory(inventoryId);
    expect(record.tokenized).to.equal(true);
    expect(record.owner).to.equal(owner.address);

    await expect(registry.connect(tokenizer).markTokenized(inventoryId, owner.address))
      .to.be.revertedWithCustomError(registry, "InventoryAlreadyTokenized")
      .withArgs(inventoryId);
  });

  it("rejects missing records and zero owners during tokenization", async function () {
    const { registry, inventoryAdmin, tokenizer, owner } = await deployInventoryRegistryFixture();

    await expect(registry.getInventory("missing-001"))
      .to.be.revertedWithCustomError(registry, "InventoryNotAnchored")
      .withArgs("missing-001");

    await expect(registry.connect(tokenizer).markTokenized("missing-001", owner.address))
      .to.be.revertedWithCustomError(registry, "InventoryNotAnchored")
      .withArgs("missing-001");

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, inventoryHash, metadataUri, true, false);

    await expect(registry.connect(tokenizer).markTokenized(inventoryId, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(registry, "ZeroOwner");
  });

  it("exposes grail protection by physical token id", async function () {
    const { registry, inventoryAdmin } = await deployInventoryRegistryFixture();
    const protectedId = "grail-001";
    const standardId = "standard-001";
    const protectedHash = ethers.keccak256(ethers.toUtf8Bytes("inventory:grail-001:v1"));
    const standardHash = ethers.keccak256(ethers.toUtf8Bytes("inventory:standard-001:v1"));

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(protectedId, protectedHash, "ipfs://inventory/grail-001.json", true, true);
    await registry
      .connect(inventoryAdmin)
      .anchorInventory(standardId, standardHash, "ipfs://inventory/standard-001.json", true, false);

    expect(await registry.isGrailProtectedToken(physicalTokenIdFor(protectedId))).to.equal(true);
    expect(await registry.isGrailProtectedToken(physicalTokenIdFor(standardId))).to.equal(false);
    expect(await registry.isGrailProtectedToken(physicalTokenIdFor("unknown-001"))).to.equal(false);
  });
});
