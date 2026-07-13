import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocolFixture, type CreateRecipeParams } from "./helpers/deploy";

const RecipeStatus = {
  Simulated: 1n,
  AdminReviewed: 2n,
  Scheduled: 3n,
  Active: 4n
} as const;

const fireShardTokenId = 7_001n;
const vaultSealTokenId = 7_002n;
const forgeDustTokenId = 7_003n;
const resonanceDustTokenId = 7_004n;
const signalBadgeTokenId = 9_001n;
const resonanceAuraTokenId = 9_002n;
const curatorSigilTokenId = 9_003n;
const craftFee = ethers.parseEther("0.001");
const resonanceFee = ethers.parseEther("0.002");
const curatorSigilFee = ethers.parseEther("0.001");

function physicalTokenIdFor(inventoryId: string): bigint {
  return BigInt(ethers.keccak256(ethers.solidityPacked(["string", "string"], ["inventory:", inventoryId])));
}

function commitmentFor(seed: string): string {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [seed]));
}

function requestIdFor(packSaleAddress: string, buyer: string, chainId: bigint): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "address", "uint256"],
      [packSaleAddress, 1n, buyer, chainId]
    )
  );
}

async function activateRecipe(
  forge: Awaited<ReturnType<typeof deployProtocolFixture>>["forge"],
  recipeAdmin: Awaited<ReturnType<typeof deployProtocolFixture>>["recipeAdmin"],
  recipeId: bigint
): Promise<void> {
  await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Simulated);
  await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.AdminReviewed);
  await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Scheduled);
  await forge.connect(recipeAdmin).setRecipeStatus(recipeId, RecipeStatus.Active);
}

function recipe(
  now: number,
  input: Pick<CreateRecipeParams, "inputTokenIds" | "inputAmounts">,
  output: Pick<CreateRecipeParams, "outputTokenId" | "outputAmount" | "outputSupplyCap">,
  overrides: Partial<CreateRecipeParams> = {}
): CreateRecipeParams {
  return {
    ...input,
    ...output,
    outputUri: `ipfs://items/${output.outputTokenId}.json`,
    fee: 0n,
    startTime: BigInt(now - 60),
    endTime: BigInt(now + 86_400),
    maxTotalCrafts: output.outputSupplyCap,
    maxCraftsPerWallet: 5n,
    requiresManualReview: false,
    excludeGrailProtectedInputs: true,
    catalystTokenIds: [],
    catalystAmounts: [],
    metadataHash: ethers.id(`blueprint:${output.outputTokenId}`),
    ...overrides
  };
}

describe("Protocol collector journey", function () {
  it("moves a physical pull through materials, Forge, market, and redemption without burning the card in Forge", async function () {
    const fixture = await deployProtocolFixture();
    const {
      registry,
      inventoryAdmin,
      packSale,
      dropAdmin,
      randomnessProvider,
      revealer,
      itemToken,
      forge,
      recipeAdmin,
      minter,
      marketplace,
      redemptionRegistry,
      redemptionAdmin,
      buyer,
      other,
      treasury
    } = fixture;
    const latestBlock = await ethers.provider.getBlock("latest");
    if (!latestBlock) {
      throw new Error("Missing latest block");
    }

    const inventoryId = "journey-physical-card-001";
    const physicalTokenId = physicalTokenIdFor(inventoryId);
    const metadataUri = "ipfs://items/journey-physical-card-001.json";
    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, ethers.id(inventoryId), metadataUri, true, true);

    await packSale.connect(dropAdmin).createDrop({
      name: "Collector Journey Drop",
      price: ethers.parseEther("0.01"),
      startTime: latestBlock.timestamp - 60,
      endTime: latestBlock.timestamp + 86_400,
      maxSupply: 1n,
      maxPerWallet: 1n,
      allowlistRoot: ethers.ZeroHash,
      inventoryIds: [inventoryId],
      metadataUris: [metadataUri],
      bonusTokenIds: [fireShardTokenId, vaultSealTokenId],
      bonusAmounts: [3n, 1n],
      bonusUris: ["ipfs://items/fire-shard.json", "ipfs://items/vault-seal.json"]
    });

    const recyclerRecipe = recipe(
      latestBlock.timestamp,
      { inputTokenIds: [fireShardTokenId], inputAmounts: [2n] },
      { outputTokenId: forgeDustTokenId, outputAmount: 1n, outputSupplyCap: 1_000n },
      { maxTotalCrafts: 1_000n, maxCraftsPerWallet: 100n }
    );
    const signalRecipe = recipe(
      latestBlock.timestamp,
      {
        inputTokenIds: [fireShardTokenId, vaultSealTokenId, forgeDustTokenId],
        inputAmounts: [1n, 1n, 1n]
      },
      { outputTokenId: signalBadgeTokenId, outputAmount: 1n, outputSupplyCap: 100n },
      { fee: craftFee, maxTotalCrafts: 100n }
    );
    const resonanceRecipe = recipe(
      latestBlock.timestamp,
      { inputTokenIds: [signalBadgeTokenId], inputAmounts: [1n] },
      { outputTokenId: resonanceAuraTokenId, outputAmount: 1n, outputSupplyCap: 25n },
      {
        fee: resonanceFee,
        maxTotalCrafts: 25n,
        maxCraftsPerWallet: 1n,
        catalystTokenIds: [physicalTokenId],
        catalystAmounts: [1n]
      }
    );
    const refineryRecipe = recipe(
      latestBlock.timestamp,
      { inputTokenIds: [signalBadgeTokenId], inputAmounts: [1n] },
      { outputTokenId: resonanceDustTokenId, outputAmount: 1n, outputSupplyCap: 250n },
      {
        maxTotalCrafts: 250n,
        catalystTokenIds: [resonanceAuraTokenId],
        catalystAmounts: [1n]
      }
    );
    const curatorSigilRecipe = recipe(
      latestBlock.timestamp,
      { inputTokenIds: [resonanceDustTokenId], inputAmounts: [1n] },
      { outputTokenId: curatorSigilTokenId, outputAmount: 1n, outputSupplyCap: 50n },
      {
        fee: curatorSigilFee,
        maxTotalCrafts: 50n,
        maxCraftsPerWallet: 1n,
        catalystTokenIds: [resonanceAuraTokenId, physicalTokenId],
        catalystAmounts: [1n, 1n]
      }
    );

    await forge.connect(recipeAdmin).createRecipe(recyclerRecipe);
    await forge.connect(recipeAdmin).createRecipe(signalRecipe);
    await forge.connect(recipeAdmin).createRecipe(resonanceRecipe);
    await forge.connect(recipeAdmin).createRecipe(refineryRecipe);
    await forge.connect(recipeAdmin).createRecipe(curatorSigilRecipe);
    await activateRecipe(forge, recipeAdmin, 1n);
    await activateRecipe(forge, recipeAdmin, 2n);
    await activateRecipe(forge, recipeAdmin, 3n);
    await activateRecipe(forge, recipeAdmin, 4n);
    await activateRecipe(forge, recipeAdmin, 5n);

    await packSale.connect(buyer).purchase(1n, { value: ethers.parseEther("0.01") });
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const randomnessRequestId = requestIdFor(await packSale.getAddress(), buyer.address, chainId);
    const seed = ethers.id("collector-journey-seed");
    await randomnessProvider.connect(revealer).commitRandomness(randomnessRequestId, commitmentFor(seed));
    await randomnessProvider.connect(revealer).revealRandomness(randomnessRequestId, seed);
    await packSale.connect(buyer).reveal(1n);

    expect(await itemToken.balanceOf(buyer.address, physicalTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(buyer.address, fireShardTokenId)).to.equal(3n);
    expect(await itemToken.balanceOf(buyer.address, vaultSealTokenId)).to.equal(1n);

    await itemToken.connect(buyer).setApprovalForAll(await forge.getAddress(), true);
    await forge.connect(buyer).craftWithImprint(1n, ethers.id("recycle:journey"));
    await forge.connect(buyer).craftWithImprint(2n, ethers.id("signal:journey"), { value: craftFee });
    await forge.connect(buyer).craftWithImprint(3n, ethers.id("resonance:journey"), { value: resonanceFee });

    await itemToken.connect(minter).mintGameItem(buyer.address, fireShardTokenId, 3n, "ipfs://items/fire-shard.json");
    await itemToken.connect(minter).mintGameItem(buyer.address, vaultSealTokenId, 1n, "ipfs://items/vault-seal.json");
    await forge.connect(buyer).craftWithImprint(1n, ethers.id("recycle-refine:journey"));
    await forge.connect(buyer).craftWithImprint(2n, ethers.id("signal-refine:journey"), { value: craftFee });
    await forge.connect(buyer).craftWithImprint(4n, ethers.id("refinery:journey"));
    await forge.connect(buyer).craftWithImprint(5n, ethers.id("sigil:journey"), { value: curatorSigilFee });

    expect(await itemToken.balanceOf(buyer.address, physicalTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(buyer.address, signalBadgeTokenId)).to.equal(0n);
    expect(await itemToken.balanceOf(buyer.address, resonanceAuraTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(buyer.address, resonanceDustTokenId)).to.equal(0n);
    expect(await itemToken.balanceOf(buyer.address, curatorSigilTokenId)).to.equal(1n);
    expect(await forge.treasuryFeesCredit(treasury.address)).to.equal(craftFee * 2n + resonanceFee + curatorSigilFee);

    const ask = ethers.parseEther("0.02");
    await itemToken.connect(buyer).setApprovalForAll(await marketplace.getAddress(), true);
    await marketplace.connect(buyer).list(physicalTokenId, 1n, ask);
    await marketplace.connect(other).buy(1n, { value: ask });
    expect(await itemToken.balanceOf(other.address, physicalTokenId)).to.equal(1n);

    await itemToken.connect(other).setApprovalForAll(await redemptionRegistry.getAddress(), true);
    await redemptionRegistry.connect(other).requestRedemption(physicalTokenId);
    await redemptionRegistry.connect(redemptionAdmin).approve(1n);
    await redemptionRegistry.connect(redemptionAdmin).markPacked(1n);
    await redemptionRegistry.connect(redemptionAdmin).markShipped(1n, "TESTNET-JOURNEY-001");
    await redemptionRegistry.connect(redemptionAdmin).complete(1n);

    expect(await itemToken.balanceOf(other.address, physicalTokenId)).to.equal(0n);
    expect(await itemToken["totalSupply(uint256)"](physicalTokenId)).to.equal(0n);
  });
});
