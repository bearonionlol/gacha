import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { BigNumberish } from "ethers";
import { deployProtocolFixture, type CreateRecipeParams } from "./helpers/deploy";

const inputTokenA = 6101n;
const inputTokenB = 6102n;
const outputTokenId = 9101n;
const inputTokenUri = "ipfs://items/forge-input.json";
const outputTokenUri = "ipfs://items/forge-output.json";
const recipeFee = ethers.parseEther("0.05");
const farFuture = 4_102_444_800n;

const RecipeStatus = {
  Draft: 0n,
  Simulated: 1n,
  AdminReviewed: 2n,
  Scheduled: 3n,
  Active: 4n,
  Paused: 5n,
  Retired: 6n
} as const;

type ProtocolFixture = Awaited<ReturnType<typeof deployProtocolFixture>>;

function physicalTokenIdFor(inventoryId: string): bigint {
  return BigInt(ethers.keccak256(ethers.solidityPacked(["string", "string"], ["inventory:", inventoryId])));
}

function recipeParams(overrides: Partial<CreateRecipeParams> = {}): CreateRecipeParams {
  return {
    inputTokenIds: [inputTokenA, inputTokenB],
    inputAmounts: [2n, 1n],
    outputTokenId,
    outputAmount: 1n,
    outputUri: outputTokenUri,
    fee: recipeFee,
    startTime: 1n,
    endTime: farFuture,
    maxTotalCrafts: 10n,
    maxCraftsPerWallet: 2n,
    requiresManualReview: false,
    excludeGrailProtectedInputs: false,
    ...overrides
  };
}

async function latestTimestamp(): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) {
    throw new Error("Missing latest block");
  }

  return BigInt(block.timestamp);
}

async function setNextBlockTimestamp(timestamp: bigint): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await ethers.provider.send("evm_mine", []);
}

async function createRecipe(
  fixture: ProtocolFixture,
  params: CreateRecipeParams = recipeParams()
): Promise<bigint> {
  await fixture.forge.connect(fixture.recipeAdmin).createRecipe(params);

  return 1n;
}

async function activateRecipe(fixture: ProtocolFixture, recipeId = 1n): Promise<void> {
  const { forge, recipeAdmin } = fixture;

  await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Simulated);
  await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.AdminReviewed);
  await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Scheduled);
  await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Active);
}

async function createActiveRecipe(
  fixture: ProtocolFixture,
  params: CreateRecipeParams = recipeParams()
): Promise<bigint> {
  const recipeId = await createRecipe(fixture, params);
  await activateRecipe(fixture, recipeId);

  return recipeId;
}

async function mintInputsTo(
  fixture: ProtocolFixture,
  owner: HardhatEthersSigner,
  params: CreateRecipeParams = recipeParams(),
  multiplier = 1n
): Promise<void> {
  const { itemToken, minter } = fixture;

  for (let index = 0; index < params.inputTokenIds.length; index++) {
    const tokenId = params.inputTokenIds[index];
    const inputAmount = params.inputAmounts[index];
    if (tokenId === undefined || inputAmount === undefined) {
      throw new Error(`Missing Forge recipe input at index ${index}`);
    }

    const amount = BigInt(inputAmount.toString()) * multiplier;

    await itemToken.connect(minter).mintGameItem(owner.address, tokenId, amount, inputTokenUri);
  }
}

async function approveForge(fixture: ProtocolFixture, owner: HardhatEthersSigner): Promise<void> {
  await fixture.itemToken.connect(owner).setApprovalForAll(await fixture.forge.getAddress(), true);
}

describe("Forge", function () {
  it("creates an inactive recipe with exact token inputs", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, recipeAdmin } = fixture;
    const params = recipeParams();

    await expect(forge.connect(recipeAdmin).createRecipe(params))
      .to.emit(forge, "RecipeCreated")
      .withArgs(1n, recipeAdmin.address);

    const recipe = await forge.recipes(1n);
    const [inputTokenIds, inputAmounts] = await forge.getRecipeInputs(1n);

    expect(recipe.status).to.equal(RecipeStatus.Draft);
    expect(recipe.outputTokenId).to.equal(params.outputTokenId);
    expect(recipe.outputAmount).to.equal(params.outputAmount);
    expect(recipe.outputUri).to.equal(params.outputUri);
    expect(recipe.fee).to.equal(params.fee);
    expect(recipe.startTime).to.equal(params.startTime);
    expect(recipe.endTime).to.equal(params.endTime);
    expect(recipe.maxTotalCrafts).to.equal(params.maxTotalCrafts);
    expect(recipe.maxCraftsPerWallet).to.equal(params.maxCraftsPerWallet);
    expect(recipe.totalCrafts).to.equal(0n);
    expect(recipe.requiresManualReview).to.equal(false);
    expect(recipe.excludeGrailProtectedInputs).to.equal(false);
    expect(recipe.exists).to.equal(true);
    expect(inputTokenIds).to.deep.equal(params.inputTokenIds);
    expect(inputAmounts).to.deep.equal(params.inputAmounts);
  });

  it("activates an admin-reviewed recipe", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, recipeAdmin } = fixture;
    const recipeId = await createRecipe(fixture);

    await expect(forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Simulated))
      .to.emit(forge, "RecipeStatusUpdated")
      .withArgs(recipeId, RecipeStatus.Draft, RecipeStatus.Simulated);
    await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.AdminReviewed);
    await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Scheduled);
    await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Active);

    const recipe = await forge.recipes(recipeId);
    expect(recipe.status).to.equal(RecipeStatus.Active);
  });

  it("rejects crafts while paused", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, recipeAdmin, owner } = fixture;
    const recipeId = await createActiveRecipe(fixture);

    await mintInputsTo(fixture, owner);
    await approveForge(fixture, owner);
    await forge.connect(recipeAdmin).pause();

    await expect(
      forge.connect(owner).craft(recipeId, { value: recipeFee })
    ).to.be.revertedWithCustomError(forge, "EnforcedPause");
  });

  it("rejects crafts for inactive recipes", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, owner } = fixture;
    const recipeId = await createRecipe(fixture);

    await mintInputsTo(fixture, owner);
    await approveForge(fixture, owner);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(forge, "RecipeNotActive")
      .withArgs(recipeId, RecipeStatus.Draft);
  });

  it("rejects self-service crafts for manual-review recipes", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, owner } = fixture;
    const recipeId = await createActiveRecipe(fixture, recipeParams({ requiresManualReview: true }));

    await mintInputsTo(fixture, owner, recipeParams({ requiresManualReview: true }));
    await approveForge(fixture, owner);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(forge, "ManualReviewRequired")
      .withArgs(recipeId);
  });

  it("burns the configured input items", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, owner } = fixture;
    const params = recipeParams();
    const recipeId = await createActiveRecipe(fixture, params);

    await mintInputsTo(fixture, owner, params, 2n);
    await approveForge(fixture, owner);
    await forge.connect(owner).craft(recipeId, { value: recipeFee });

    expect(await itemToken.balanceOf(owner.address, inputTokenA)).to.equal(2n);
    expect(await itemToken.balanceOf(owner.address, inputTokenB)).to.equal(1n);
  });

  it("mints the configured output item", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, owner } = fixture;
    const params = recipeParams({ outputAmount: 3n });
    const recipeId = await createActiveRecipe(fixture, params);

    await mintInputsTo(fixture, owner, params);
    await approveForge(fixture, owner);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.emit(forge, "Crafted")
      .withArgs(recipeId, owner.address, outputTokenId, 3n, recipeFee);

    expect(await itemToken.balanceOf(owner.address, outputTokenId)).to.equal(3n);
    expect(await itemToken.uri(outputTokenId)).to.equal(outputTokenUri);
  });

  it("collects the recipe fee", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, owner, treasury } = fixture;
    const recipeId = await createActiveRecipe(fixture);

    await mintInputsTo(fixture, owner);
    await approveForge(fixture, owner);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee })).to.changeEtherBalances(
      [forge, treasury],
      [recipeFee, 0n]
    );

    expect(await forge.treasuryFeesCredit(treasury.address)).to.equal(recipeFee);

    const withdrawal = forge.connect(treasury).withdrawTreasuryFees();
    await expect(withdrawal)
      .to.emit(forge, "TreasuryFeesWithdrawn")
      .withArgs(treasury.address, treasury.address, recipeFee);
    await expect(withdrawal).to.changeEtherBalances([forge, treasury], [-recipeFee, recipeFee]);
    expect(await forge.treasuryFeesCredit(treasury.address)).to.equal(0n);
  });

  it("enforces max total crafts", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, owner, other } = fixture;
    const params = recipeParams({ maxTotalCrafts: 1n, maxCraftsPerWallet: 1n });
    const recipeId = await createActiveRecipe(fixture, params);

    await mintInputsTo(fixture, owner, params);
    await mintInputsTo(fixture, other, params);
    await approveForge(fixture, owner);
    await approveForge(fixture, other);

    await forge.connect(owner).craft(recipeId, { value: recipeFee });

    await expect(forge.connect(other).craft(recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(forge, "MaxTotalCraftsReached")
      .withArgs(recipeId, 1n);
  });

  it("enforces max crafts per wallet", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, owner } = fixture;
    const params = recipeParams({ maxTotalCrafts: 2n, maxCraftsPerWallet: 1n });
    const recipeId = await createActiveRecipe(fixture, params);

    await mintInputsTo(fixture, owner, params, 2n);
    await approveForge(fixture, owner);
    await forge.connect(owner).craft(recipeId, { value: recipeFee });

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(forge, "MaxWalletCraftsReached")
      .withArgs(recipeId, owner.address, 1n);
  });

  it("blocks grail-protected inputs when the recipe excludes grails", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, registry, inventoryAdmin, minter, owner } = fixture;
    const inventoryId = "grail-forge-input-001";
    const grailTokenId = physicalTokenIdFor(inventoryId);
    const params = recipeParams({
      inputTokenIds: [grailTokenId],
      inputAmounts: [1n],
      excludeGrailProtectedInputs: true
    });
    const recipeId = await createActiveRecipe(fixture, params);

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, ethers.id(inventoryId), "ipfs://items/grail-forge-input-001.json", true, true);
    await itemToken
      .connect(minter)
      .mintInventoryItem(owner.address, grailTokenId, inventoryId, "ipfs://items/grail-forge-input-001.json");
    await approveForge(fixture, owner);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(forge, "GrailProtectedInputExcluded")
      .withArgs(recipeId, grailTokenId);
  });

  it("rejects input token id and amount array length mismatches", async function () {
    const { forge, recipeAdmin } = await deployProtocolFixture();

    await expect(
      forge.connect(recipeAdmin).createRecipe(recipeParams({ inputTokenIds: [inputTokenA], inputAmounts: [1n, 2n] }))
    ).to.be.revertedWithCustomError(forge, "InvalidRecipeParams");
  });

  it("rejects zero input amounts and zero output amounts", async function () {
    const { forge, recipeAdmin } = await deployProtocolFixture();

    await expect(
      forge.connect(recipeAdmin).createRecipe(recipeParams({ inputAmounts: [0n, 1n] }))
    ).to.be.revertedWithCustomError(forge, "InvalidRecipeParams");

    await expect(
      forge.connect(recipeAdmin).createRecipe(recipeParams({ outputAmount: 0n }))
    ).to.be.revertedWithCustomError(forge, "InvalidRecipeParams");
  });

  it("requires the exact fee including rejecting overpayment", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, owner } = fixture;
    const recipeId = await createActiveRecipe(fixture);

    await mintInputsTo(fixture, owner, recipeParams(), 3n);
    await approveForge(fixture, owner);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee - 1n }))
      .to.be.revertedWithCustomError(forge, "ExactPaymentRequired")
      .withArgs(recipeFee, recipeFee - 1n);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee + 1n }))
      .to.be.revertedWithCustomError(forge, "ExactPaymentRequired")
      .withArgs(recipeFee, recipeFee + 1n);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.emit(forge, "Crafted")
      .withArgs(recipeId, owner.address, outputTokenId, 1n, recipeFee);
  });

  it("craft requires user approval to Forge for input burns", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, owner } = fixture;
    const recipeId = await createActiveRecipe(fixture);

    await mintInputsTo(fixture, owner);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(itemToken, "BurnNotApproved")
      .withArgs(owner.address);
  });

  it("enforces schedule window start and end", async function () {
    const beforeStartFixture = await deployProtocolFixture();
    const current = await latestTimestamp();
    const startTime = current + 100n;
    const endTime = startTime + 100n;
    const beforeStartParams = recipeParams({ startTime, endTime });
    const beforeStartRecipeId = await createActiveRecipe(beforeStartFixture, beforeStartParams);

    await mintInputsTo(beforeStartFixture, beforeStartFixture.owner, beforeStartParams);
    await approveForge(beforeStartFixture, beforeStartFixture.owner);

    await expect(
      beforeStartFixture.forge.connect(beforeStartFixture.owner).craft(beforeStartRecipeId, { value: recipeFee })
    )
      .to.be.revertedWithCustomError(beforeStartFixture.forge, "InactiveSchedule")
      .withArgs(beforeStartRecipeId, startTime, endTime);

    const afterEndFixture = await deployProtocolFixture();
    const afterEndParams = recipeParams({ startTime: current + 1n, endTime: current + 50n });
    const afterEndRecipeId = await createActiveRecipe(afterEndFixture, afterEndParams);

    await mintInputsTo(afterEndFixture, afterEndFixture.owner, afterEndParams);
    await approveForge(afterEndFixture, afterEndFixture.owner);
    await setNextBlockTimestamp(current + 51n);

    await expect(
      afterEndFixture.forge.connect(afterEndFixture.owner).craft(afterEndRecipeId, { value: recipeFee })
    )
      .to.be.revertedWithCustomError(afterEndFixture.forge, "InactiveSchedule")
      .withArgs(afterEndRecipeId, current + 1n, current + 50n);
  });

  it("restricts recipe creation, status changes, and pause controls to recipe admins", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, recipeAdmin, other } = fixture;
    const role = await forge.RECIPE_ADMIN_ROLE();
    const recipeId = await createRecipe(fixture);

    await expect(forge.connect(other).createRecipe(recipeParams()))
      .to.be.revertedWithCustomError(forge, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await expect(forge.connect(other).setRecipeStatus(recipeId, RecipeStatus.Simulated))
      .to.be.revertedWithCustomError(forge, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await expect(forge.connect(other).pause())
      .to.be.revertedWithCustomError(forge, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await forge.connect(recipeAdmin).pause();

    await expect(forge.connect(other).unpause())
      .to.be.revertedWithCustomError(forge, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);
  });

  it("manual-review recipes can be created and activated but craft reverts", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, owner } = fixture;
    const params = recipeParams({ requiresManualReview: true });
    const recipeId = await createActiveRecipe(fixture, params);
    const recipe = await forge.recipes(recipeId);

    expect(recipe.status).to.equal(RecipeStatus.Active);
    expect(recipe.requiresManualReview).to.equal(true);

    await mintInputsTo(fixture, owner, params);
    await approveForge(fixture, owner);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(forge, "ManualReviewRequired")
      .withArgs(recipeId);
  });

  it("rejects zero constructor addresses", async function () {
    const { itemToken, registry, treasury } = await deployProtocolFixture();
    const forgeFactory = await ethers.getContractFactory("Forge");

    await expect(
      forgeFactory.deploy(ethers.ZeroAddress, await registry.getAddress(), treasury.address)
    ).to.be.revertedWithCustomError(forgeFactory, "InvalidAddress");

    await expect(
      forgeFactory.deploy(await itemToken.getAddress(), ethers.ZeroAddress, treasury.address)
    ).to.be.revertedWithCustomError(forgeFactory, "InvalidAddress");

    await expect(
      forgeFactory.deploy(await itemToken.getAddress(), await registry.getAddress(), ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(forgeFactory, "InvalidAddress");
  });
});
