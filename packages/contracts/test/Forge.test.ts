import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { BaseContract, BigNumberish, ContractRunner, ContractTransactionResponse } from "ethers";
import { deployProtocolFixture, type CreateRecipeParams } from "./helpers/deploy";

const inputTokenA = 6101n;
const inputTokenB = 6102n;
const outputTokenId = 9101n;
const inputTokenUri = "ipfs://items/forge-input.json";
const outputTokenUri = "ipfs://items/forge-output.json";
const alternateOutputTokenUri = "ipfs://items/forge-output-alt.json";
const recipeFee = ethers.parseEther("0.05");
const farFuture = 4_102_444_800n;
const recipeMetadataHash = ethers.id("forge-recipe-metadata-v3");
const outputSupplyCap = 100n;

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

type NonERC1155ForgeCrafter = Omit<BaseContract, "connect"> & {
  approveItemOperator(itemToken: string, operator: string): Promise<ContractTransactionResponse>;
  craft(
    forge: string,
    recipeId: BigNumberish,
    overrides?: { value?: BigNumberish }
  ): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): NonERC1155ForgeCrafter;
};

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
    catalystTokenIds: [],
    catalystAmounts: [],
    outputSupplyCap,
    metadataHash: recipeMetadataHash,
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
  await mintInputsToAddress(fixture, owner.address, params, multiplier);
}

async function mintInputsToAddress(
  fixture: ProtocolFixture,
  ownerAddress: string,
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

    await itemToken.connect(minter).mintGameItem(ownerAddress, tokenId, amount, inputTokenUri);
  }
}

async function approveForge(fixture: ProtocolFixture, owner: HardhatEthersSigner): Promise<void> {
  await fixture.itemToken.connect(owner).setApprovalForAll(await fixture.forge.getAddress(), true);
}

async function deployNonERC1155ForgeCrafterWithInputs(
  fixture: ProtocolFixture,
  params: CreateRecipeParams = recipeParams()
): Promise<NonERC1155ForgeCrafter> {
  const futureCrafterAddress = ethers.getCreateAddress({
    from: fixture.deployer.address,
    nonce: await fixture.deployer.getNonce()
  });

  await mintInputsToAddress(fixture, futureCrafterAddress, params);

  const crafter = (await ethers.deployContract(
    "NonERC1155ForgeCrafter"
  )) as unknown as NonERC1155ForgeCrafter;
  await crafter.waitForDeployment();
  expect(await crafter.getAddress()).to.equal(futureCrafterAddress);

  return crafter;
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
    expect(recipe.outputSupplyCap).to.equal(outputSupplyCap);
    expect(recipe.metadataHash).to.equal(recipeMetadataHash);
    expect(recipe.blueprintHash).to.not.equal(ethers.ZeroHash);
    expect(recipe.reservationReleased).to.equal(false);
    expect(await forge.outputSupplyCaps(params.outputTokenId)).to.equal(outputSupplyCap);
    expect(await forge.outputReserved(params.outputTokenId)).to.equal(params.maxTotalCrafts);
    expect(inputTokenIds).to.deep.equal(params.inputTokenIds);
    expect(inputAmounts).to.deep.equal(params.inputAmounts);
  });

  it("rejects physical inventory as a consumable even when it is not grail protected", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, registry, inventoryAdmin, minter, owner, recipeAdmin } = fixture;
    const inventoryId = "physical-forge-input-001";
    const physicalTokenId = physicalTokenIdFor(inventoryId);

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, ethers.id(inventoryId), "ipfs://items/physical-forge-input-001.json", true, false);
    await itemToken
      .connect(minter)
      .mintInventoryItem(owner.address, physicalTokenId, inventoryId, "ipfs://items/physical-forge-input-001.json");

    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({ inputTokenIds: [physicalTokenId], inputAmounts: [1n] })
      )
    )
      .to.be.revertedWithCustomError(forge, "InvalidBurnInputToken")
      .withArgs(physicalTokenId);
  });

  it("uses physical inventory as a non-consumable ownership catalyst", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, registry, inventoryAdmin, minter, owner } = fixture;
    const inventoryId = "physical-forge-catalyst-001";
    const catalystTokenId = physicalTokenIdFor(inventoryId);
    const params = recipeParams({ catalystTokenIds: [catalystTokenId], catalystAmounts: [1n] });

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, ethers.id(inventoryId), "ipfs://items/physical-forge-catalyst-001.json", true, true);
    await itemToken
      .connect(minter)
      .mintInventoryItem(owner.address, catalystTokenId, inventoryId, "ipfs://items/physical-forge-catalyst-001.json");
    const recipeId = await createActiveRecipe(fixture, params);
    await mintInputsTo(fixture, owner, params);
    await approveForge(fixture, owner);

    await forge.connect(owner).craft(recipeId, { value: recipeFee });

    expect(await itemToken.balanceOf(owner.address, catalystTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(owner.address, outputTokenId)).to.equal(1n);
  });

  it("retains a game-item catalyst while consuming its selected reagent", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, minter, owner } = fixture;
    const refinedOutputTokenId = 9_201n;
    const params = recipeParams({
      inputTokenIds: [inputTokenA],
      inputAmounts: [1n],
      outputTokenId: refinedOutputTokenId,
      outputUri: "ipfs://items/forge-refined-output.json",
      catalystTokenIds: [inputTokenB],
      catalystAmounts: [1n],
      outputSupplyCap: 10n
    });
    const recipeId = await createActiveRecipe(fixture, params);
    await mintInputsTo(fixture, owner, params);
    await itemToken.connect(minter).mintGameItem(owner.address, inputTokenB, 1n, inputTokenUri);
    await approveForge(fixture, owner);

    await forge.connect(owner).craft(recipeId, { value: recipeFee });

    expect(await itemToken.balanceOf(owner.address, inputTokenA)).to.equal(0n);
    expect(await itemToken.balanceOf(owner.address, inputTokenB)).to.equal(1n);
    expect(await itemToken.balanceOf(owner.address, refinedOutputTokenId)).to.equal(1n);
  });

  it("requires ownership of every catalyst", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, registry, inventoryAdmin, owner } = fixture;
    const inventoryId = "missing-forge-catalyst-001";
    const catalystTokenId = physicalTokenIdFor(inventoryId);
    const params = recipeParams({ catalystTokenIds: [catalystTokenId], catalystAmounts: [1n] });

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, ethers.id(inventoryId), "ipfs://items/missing-forge-catalyst-001.json", true, true);
    const recipeId = await createActiveRecipe(fixture, params);
    await mintInputsTo(fixture, owner, params);
    await approveForge(fixture, owner);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(forge, "MissingCatalyst")
      .withArgs(recipeId, catalystTokenId, 1n, 0n);
  });

  it("rejects duplicate and oversized burn input definitions", async function () {
    const { forge, recipeAdmin } = await deployProtocolFixture();

    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({ inputTokenIds: [inputTokenA, inputTokenA], inputAmounts: [1n, 1n] })
      )
    )
      .to.be.revertedWithCustomError(forge, "DuplicateRecipeToken")
      .withArgs(inputTokenA);

    const tooManyInputs = Array.from({ length: 10 }, (_, index) => 20_000n + BigInt(index));
    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({ inputTokenIds: tooManyInputs, inputAmounts: tooManyInputs.map(() => 1n) })
      )
    )
      .to.be.revertedWithCustomError(forge, "TooManyBurnInputs")
      .withArgs(10n, 9n);
  });

  it("reserves immutable output capacity across recipes", async function () {
    const { forge, recipeAdmin } = await deployProtocolFixture();

    await forge.connect(recipeAdmin).createRecipe(
      recipeParams({ maxTotalCrafts: 60n, maxCraftsPerWallet: 2n })
    );

    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({ maxTotalCrafts: 41n, maxCraftsPerWallet: 2n })
      )
    )
      .to.be.revertedWithCustomError(forge, "OutputCapacityExceeded")
      .withArgs(outputTokenId, outputSupplyCap, 60n, 41n);

    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({ outputSupplyCap: outputSupplyCap + 1n })
      )
    )
      .to.be.revertedWithCustomError(forge, "OutputSupplyCapMismatch")
      .withArgs(outputTokenId, outputSupplyCap, outputSupplyCap + 1n);
  });

  it("releases unminted output reservation only when a recipe is retired", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, recipeAdmin } = fixture;
    const recipeId = await createRecipe(fixture, recipeParams({ maxTotalCrafts: 10n }));

    expect(await forge.outputReserved(outputTokenId)).to.equal(10n);
    await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Retired);
    expect(await forge.outputReserved(outputTokenId)).to.equal(0n);
    expect((await forge.recipes(recipeId)).reservationReleased).to.equal(true);
  });

  it("rejects physical inventory output token ids at recipe creation", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, minter, owner, recipeAdmin } = fixture;
    const inventoryOutputId = physicalTokenIdFor("forge-output-inventory-001");

    await itemToken
      .connect(minter)
      .mintInventoryItem(
        owner.address,
        inventoryOutputId,
        "forge-output-inventory-001",
        "ipfs://items/forge-output-inventory-001.json"
      );

    await expect(
      forge.connect(recipeAdmin).createRecipe(recipeParams({ outputTokenId: inventoryOutputId }))
    )
      .to.be.revertedWithCustomError(forge, "InvalidOutputTokenId")
      .withArgs(inventoryOutputId);
    expect(await forge.nextRecipeId()).to.equal(1n);
  });

  it("rejects output token ids outside the game namespace at recipe creation", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, recipeAdmin } = fixture;
    const invalidOutputTokenId = (await itemToken.GAME_TOKEN_ID_MAX()) + 1n;

    await expect(
      forge.connect(recipeAdmin).createRecipe(recipeParams({ outputTokenId: invalidOutputTokenId }))
    )
      .to.be.revertedWithCustomError(forge, "InvalidOutputTokenId")
      .withArgs(invalidOutputTokenId);
    expect(await forge.nextRecipeId()).to.equal(1n);
  });

  it("enforces one output URI per Forge output token id", async function () {
    const { forge, recipeAdmin } = await deployProtocolFixture();
    const sharedOutputId = outputTokenId + 100n;

    await forge.connect(recipeAdmin).createRecipe(
      recipeParams({
        outputTokenId: sharedOutputId,
        outputUri: outputTokenUri
      })
    );

    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({
          outputTokenId: sharedOutputId,
          outputUri: outputTokenUri
        })
      )
    )
      .to.emit(forge, "RecipeCreated")
      .withArgs(2n, recipeAdmin.address);

    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({
          outputTokenId: sharedOutputId,
          outputUri: alternateOutputTokenUri
        })
      )
    )
      .to.be.revertedWithCustomError(forge, "OutputUriMismatch")
      .withArgs(sharedOutputId, outputTokenUri, alternateOutputTokenUri);
    expect(await forge.nextRecipeId()).to.equal(3n);
  });

  it("rejects existing game output token ids with a mismatched custom URI", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, minter, owner, recipeAdmin } = fixture;
    const existingGameOutputId = outputTokenId + 200n;

    await itemToken
      .connect(minter)
      .mintGameItem(owner.address, existingGameOutputId, 1n, outputTokenUri);

    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({
          outputTokenId: existingGameOutputId,
          outputUri: alternateOutputTokenUri
        })
      )
    )
      .to.be.revertedWithCustomError(forge, "OutputUriMismatch")
      .withArgs(existingGameOutputId, outputTokenUri, alternateOutputTokenUri);
    expect(await forge.nextRecipeId()).to.equal(1n);
  });

  it("allows existing game output token ids with the matching custom URI", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, minter, owner, recipeAdmin } = fixture;
    const existingGameOutputId = outputTokenId + 201n;

    await itemToken
      .connect(minter)
      .mintGameItem(owner.address, existingGameOutputId, 1n, outputTokenUri);

    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({
          outputTokenId: existingGameOutputId,
          outputUri: outputTokenUri
        })
      )
    )
      .to.emit(forge, "RecipeCreated")
      .withArgs(1n, recipeAdmin.address);

    const recipe = await forge.recipes(1n);
    expect(recipe.outputTokenId).to.equal(existingGameOutputId);
    expect(recipe.outputUri).to.equal(outputTokenUri);
  });

  it("rejects unknown output token ids with a mismatched custom URI", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, recipeAdmin, uriSetter } = fixture;
    const unknownOutputId = outputTokenId + 202n;

    expect(await itemToken.tokenKind(unknownOutputId)).to.equal(0n);
    await itemToken.connect(uriSetter).setTokenURI(unknownOutputId, outputTokenUri);

    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({
          outputTokenId: unknownOutputId,
          outputUri: alternateOutputTokenUri
        })
      )
    )
      .to.be.revertedWithCustomError(forge, "OutputUriMismatch")
      .withArgs(unknownOutputId, outputTokenUri, alternateOutputTokenUri);
    expect(await forge.nextRecipeId()).to.equal(1n);
  });

  it("allows unknown output token ids with the matching custom URI", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, recipeAdmin, uriSetter } = fixture;
    const unknownOutputId = outputTokenId + 203n;

    expect(await itemToken.tokenKind(unknownOutputId)).to.equal(0n);
    await itemToken.connect(uriSetter).setTokenURI(unknownOutputId, outputTokenUri);

    await expect(
      forge.connect(recipeAdmin).createRecipe(
        recipeParams({
          outputTokenId: unknownOutputId,
          outputUri: outputTokenUri
        })
      )
    )
      .to.emit(forge, "RecipeCreated")
      .withArgs(1n, recipeAdmin.address);

    const recipe = await forge.recipes(1n);
    expect(recipe.outputTokenId).to.equal(unknownOutputId);
    expect(recipe.outputUri).to.equal(outputTokenUri);
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

  it("rejects invalid lifecycle shortcuts and same-status transitions", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, recipeAdmin } = fixture;
    const recipeId = await createRecipe(fixture);

    await expect(forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Active))
      .to.be.revertedWithCustomError(forge, "InvalidRecipeStatusTransition")
      .withArgs(recipeId, RecipeStatus.Draft, RecipeStatus.Active);

    await expect(forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Draft))
      .to.be.revertedWithCustomError(forge, "InvalidRecipeStatusTransition")
      .withArgs(recipeId, RecipeStatus.Draft, RecipeStatus.Draft);

    await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Simulated);

    await expect(forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Active))
      .to.be.revertedWithCustomError(forge, "InvalidRecipeStatusTransition")
      .withArgs(recipeId, RecipeStatus.Simulated, RecipeStatus.Active);

    await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.AdminReviewed);
    await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Scheduled);
    await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Active);
    await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Retired);

    await expect(forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Active))
      .to.be.revertedWithCustomError(forge, "InvalidRecipeStatusTransition")
      .withArgs(recipeId, RecipeStatus.Retired, RecipeStatus.Active);
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

    await expect(
      forge.connect(recipeAdmin).createRecipe(recipeParams({ outputUri: "" }))
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

  it("records unique user-selected craft imprints and rejects replay", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, owner } = fixture;
    const params = recipeParams({ maxTotalCrafts: 2n, maxCraftsPerWallet: 2n });
    const recipeId = await createActiveRecipe(fixture, params);
    const imprintHash = ethers.id("owner-signal-frame-alpha");

    await mintInputsTo(fixture, owner, params, 2n);
    await approveForge(fixture, owner);

    await expect(forge.connect(owner).craftWithImprint(recipeId, imprintHash, { value: recipeFee }))
      .to.emit(forge, "CraftProvenance")
      .withArgs(1n, recipeId, owner.address, imprintHash, (await forge.recipes(recipeId)).blueprintHash);

    expect(await forge.usedImprints(recipeId, owner.address, imprintHash)).to.equal(true);
    const record = await forge.crafts(1n);
    expect(record.recipeId).to.equal(recipeId);
    expect(record.crafter).to.equal(owner.address);
    expect(record.outputTokenId).to.equal(outputTokenId);
    expect(record.imprintHash).to.equal(imprintHash);

    await expect(forge.connect(owner).craftWithImprint(recipeId, imprintHash, { value: recipeFee }))
      .to.be.revertedWithCustomError(forge, "ImprintAlreadyUsed")
      .withArgs(recipeId, owner.address, imprintHash);
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

  it("rolls back recipe accounting when an input burn fails", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, owner, treasury } = fixture;
    const recipeId = await createActiveRecipe(fixture);

    await mintInputsTo(fixture, owner);

    const beforeRecipe = await forge.recipes(recipeId);
    const beforeWalletCrafts = await forge.walletCrafts(recipeId, owner.address);
    const beforeTreasuryCredit = await forge.treasuryFeesCredit(treasury.address);
    const beforeInputABalance = await itemToken.balanceOf(owner.address, inputTokenA);
    const beforeInputBBalance = await itemToken.balanceOf(owner.address, inputTokenB);
    const beforeOutputBalance = await itemToken.balanceOf(owner.address, outputTokenId);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(itemToken, "BurnNotApproved")
      .withArgs(owner.address);

    const afterRecipe = await forge.recipes(recipeId);
    expect(afterRecipe.totalCrafts).to.equal(beforeRecipe.totalCrafts);
    expect(await forge.walletCrafts(recipeId, owner.address)).to.equal(beforeWalletCrafts);
    expect(await forge.treasuryFeesCredit(treasury.address)).to.equal(beforeTreasuryCredit);
    expect(await itemToken.balanceOf(owner.address, inputTokenA)).to.equal(beforeInputABalance);
    expect(await itemToken.balanceOf(owner.address, inputTokenB)).to.equal(beforeInputBBalance);
    expect(await itemToken.balanceOf(owner.address, outputTokenId)).to.equal(beforeOutputBalance);
    expect(await ethers.provider.getBalance(await forge.getAddress())).to.equal(0n);
  });

  it("rolls back an earlier input burn when a later input burn fails", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, minter, owner, treasury } = fixture;
    const recipeId = await createActiveRecipe(fixture);
    const forgeAddress = await forge.getAddress();

    await itemToken.connect(minter).mintGameItem(owner.address, inputTokenA, 2n, inputTokenUri);
    await approveForge(fixture, owner);

    const beforeRecipe = await forge.recipes(recipeId);
    const beforeWalletCrafts = await forge.walletCrafts(recipeId, owner.address);
    const beforeTreasuryCredit = await forge.treasuryFeesCredit(treasury.address);
    const beforeForgeBalance = await ethers.provider.getBalance(forgeAddress);
    const beforeInputABalance = await itemToken.balanceOf(owner.address, inputTokenA);
    const beforeInputBBalance = await itemToken.balanceOf(owner.address, inputTokenB);
    const beforeOutputBalance = await itemToken.balanceOf(owner.address, outputTokenId);

    await expect(forge.connect(owner).craft(recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(itemToken, "ERC1155InsufficientBalance")
      .withArgs(owner.address, 0n, 1n, inputTokenB);

    const afterRecipe = await forge.recipes(recipeId);
    expect(afterRecipe.totalCrafts).to.equal(beforeRecipe.totalCrafts);
    expect(await forge.walletCrafts(recipeId, owner.address)).to.equal(beforeWalletCrafts);
    expect(await forge.treasuryFeesCredit(treasury.address)).to.equal(beforeTreasuryCredit);
    expect(await ethers.provider.getBalance(forgeAddress)).to.equal(beforeForgeBalance);
    expect(await itemToken.balanceOf(owner.address, inputTokenA)).to.equal(beforeInputABalance);
    expect(await itemToken.balanceOf(owner.address, inputTokenB)).to.equal(beforeInputBBalance);
    expect(await itemToken.balanceOf(owner.address, outputTokenId)).to.equal(beforeOutputBalance);
  });

  it("rolls back input burns when output minting to a non-receiver crafter fails", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, itemToken, treasury } = fixture;
    const recipeId = await createActiveRecipe(fixture);
    const forgeAddress = await forge.getAddress();
    const crafter = await deployNonERC1155ForgeCrafterWithInputs(fixture);
    const crafterAddress = await crafter.getAddress();

    await crafter.approveItemOperator(await itemToken.getAddress(), forgeAddress);

    const beforeRecipe = await forge.recipes(recipeId);
    const beforeWalletCrafts = await forge.walletCrafts(recipeId, crafterAddress);
    const beforeTreasuryCredit = await forge.treasuryFeesCredit(treasury.address);
    const beforeForgeBalance = await ethers.provider.getBalance(forgeAddress);
    const beforeInputABalance = await itemToken.balanceOf(crafterAddress, inputTokenA);
    const beforeInputBBalance = await itemToken.balanceOf(crafterAddress, inputTokenB);
    const beforeOutputBalance = await itemToken.balanceOf(crafterAddress, outputTokenId);

    await expect(crafter.craft(forgeAddress, recipeId, { value: recipeFee }))
      .to.be.revertedWithCustomError(itemToken, "ERC1155InvalidReceiver")
      .withArgs(crafterAddress);

    const afterRecipe = await forge.recipes(recipeId);
    expect(afterRecipe.totalCrafts).to.equal(beforeRecipe.totalCrafts);
    expect(await forge.walletCrafts(recipeId, crafterAddress)).to.equal(beforeWalletCrafts);
    expect(await forge.treasuryFeesCredit(treasury.address)).to.equal(beforeTreasuryCredit);
    expect(await ethers.provider.getBalance(forgeAddress)).to.equal(beforeForgeBalance);
    expect(await itemToken.balanceOf(crafterAddress, inputTokenA)).to.equal(beforeInputABalance);
    expect(await itemToken.balanceOf(crafterAddress, inputTokenB)).to.equal(beforeInputBBalance);
    expect(await itemToken.balanceOf(crafterAddress, outputTokenId)).to.equal(beforeOutputBalance);
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
    const pauserRole = await forge.PAUSER_ROLE();
    const recipeId = await createRecipe(fixture);

    await expect(forge.connect(other).createRecipe(recipeParams()))
      .to.be.revertedWithCustomError(forge, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await expect(forge.connect(other).setRecipeStatus(recipeId, RecipeStatus.Simulated))
      .to.be.revertedWithCustomError(forge, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, role);

    await expect(forge.connect(other).pause())
      .to.be.revertedWithCustomError(forge, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, pauserRole);

    await forge.connect(recipeAdmin).pause();

    await expect(forge.connect(other).unpause())
      .to.be.revertedWithCustomError(forge, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, pauserRole);
  });

  it("lets a separate reviewer grant a bounded manual-review craft allowance", async function () {
    const fixture = await deployProtocolFixture();
    const { forge, owner, recipeAdmin, other } = fixture;
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

    const reviewerRole = await forge.CRAFT_REVIEWER_ROLE();
    await expect(forge.connect(other).setCraftAllowance(recipeId, owner.address, 1n))
      .to.be.revertedWithCustomError(forge, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, reviewerRole);

    await forge.connect(recipeAdmin).setCraftAllowance(recipeId, owner.address, 1n);
    expect(await forge.reviewAllowances(recipeId, owner.address)).to.equal(1n);

    await forge.connect(owner).craft(recipeId, { value: recipeFee });
    expect(await forge.reviewAllowances(recipeId, owner.address)).to.equal(0n);
    expect(await forge.walletCrafts(recipeId, owner.address)).to.equal(1n);
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
