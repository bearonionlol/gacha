import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

const DustKind = {
  Magic: 0n,
  Echo: 1n,
  Prism: 2n,
  Star: 3n
} as const;

const RecipeKind = {
  Recast: 0n,
  GuidedRecast: 1n,
  Ascension: 2n,
  GuidedAscension: 3n,
  SetAscension: 4n
} as const;

const ClaimStatus = {
  PendingRandomness: 1n,
  AwaitingChoice: 2n,
  Settled: 3n,
  Cancelled: 4n
} as const;

type PoolMode = "full" | "limited-recast";

interface InventoryTokenOptions {
  inventoryId: string;
  owner: HardhatEthersSigner;
  canonicalKey: string;
  setKey: string;
  tier: number;
  tradeInEligible: boolean;
  tierPoolEligible: boolean;
  grailProtected?: boolean;
}

function physicalTokenIdFor(inventoryId: string): bigint {
  return BigInt(
    ethers.keccak256(ethers.solidityPacked(["string", "string"], ["inventory:", inventoryId]))
  );
}

function commitmentFor(seed: string): string {
  return ethers.keccak256(abiCoder.encode(["bytes32"], [seed]));
}

function requireSigner(
  signers: HardhatEthersSigner[],
  index: number,
  label: string
): HardhatEthersSigner {
  const signer = signers[index];
  if (!signer) throw new Error(`Missing ${label} signer`);
  return signer;
}

async function deployContract(name: string, args: unknown[] = []): Promise<any> {
  const contract = await ethers.deployContract(name, args);
  await contract.waitForDeployment();
  return contract;
}

async function dustBalances(ledger: any, account: string): Promise<bigint[]> {
  return Array.from(await ledger.balancesOf(account)) as bigint[];
}

async function deployVaultForgeFixture(poolMode: PoolMode = "full") {
  const signers = await ethers.getSigners();
  const deployer = requireSigner(signers, 0, "deployer");
  const inventoryAdmin = requireSigner(signers, 1, "inventory admin");
  const tokenizer = requireSigner(signers, 2, "tokenizer");
  const minter = requireSigner(signers, 3, "minter");
  const policyAdmin = requireSigner(signers, 4, "policy admin");
  const poolAdmin = requireSigner(signers, 5, "pool admin");
  const recipeAdmin = requireSigner(signers, 6, "recipe admin");
  const dustOperator = requireSigner(signers, 7, "dust operator");
  const player = requireSigner(signers, 8, "player");
  const revealer = requireSigner(signers, 9, "revealer");
  const treasury = requireSigner(signers, 10, "treasury");
  const other = requireSigner(signers, 11, "other");

  const registry = await deployContract("InventoryRegistry");
  const itemToken = await deployContract("ItemToken");
  const dustLedger = await deployContract("DustLedger");
  const dustRewardPolicy = await deployContract("DustRewardPolicy");
  const randomnessProvider = await deployContract("CommitRevealRandomnessProvider");
  const collectiblePolicy = await deployContract("CollectibleForgePolicy", [
    await registry.getAddress()
  ]);
  const tradeInVault = await deployContract("TradeInVault", [await itemToken.getAddress()]);
  const tierPool = await deployContract("TierPool", [
    await itemToken.getAddress(),
    await collectiblePolicy.getAddress()
  ]);
  const passport = await deployContract("VaultPassport");
  const forge = await deployContract("VaultForge", [
    await itemToken.getAddress(),
    await registry.getAddress(),
    await collectiblePolicy.getAddress(),
    await dustLedger.getAddress(),
    await tradeInVault.getAddress(),
    await tierPool.getAddress(),
    await passport.getAddress(),
    await randomnessProvider.getAddress(),
    treasury.address
  ]);

  await registry.grantRole(await registry.INVENTORY_ADMIN_ROLE(), inventoryAdmin.address);
  await registry.grantRole(await registry.TOKENIZER_ROLE(), tokenizer.address);
  await itemToken.grantRole(await itemToken.MINTER_ROLE(), minter.address);
  await registry.grantRole(await registry.TOKENIZER_ROLE(), await tierPool.getAddress());
  await itemToken.grantRole(await itemToken.MINTER_ROLE(), await tierPool.getAddress());
  await collectiblePolicy.grantRole(
    await collectiblePolicy.POLICY_ADMIN_ROLE(),
    policyAdmin.address
  );
  await dustRewardPolicy.grantRole(
    await dustRewardPolicy.POLICY_ADMIN_ROLE(),
    policyAdmin.address
  );
  await dustLedger.grantRole(await dustLedger.CREDIT_ROLE(), dustOperator.address);
  await dustLedger.grantRole(await dustLedger.SPENDER_ROLE(), dustOperator.address);
  await dustLedger.grantRole(await dustLedger.CREDIT_ROLE(), await forge.getAddress());
  await dustLedger.grantRole(await dustLedger.SPENDER_ROLE(), await forge.getAddress());
  await dustLedger.grantRole(await dustLedger.RESTORER_ROLE(), await forge.getAddress());
  await dustLedger.grantRole(await dustLedger.PAUSER_ROLE(), deployer.address);
  await tierPool.grantRole(await tierPool.POOL_ADMIN_ROLE(), poolAdmin.address);
  await passport.grantRole(await passport.FORGE_ROLE(), await forge.getAddress());
  await randomnessProvider.grantRole(
    await randomnessProvider.REQUESTER_ROLE(),
    await forge.getAddress()
  );
  await randomnessProvider.grantRole(
    await randomnessProvider.REVEALER_ROLE(),
    revealer.address
  );
  await forge.grantRole(await forge.RECIPE_ADMIN_ROLE(), recipeAdmin.address);
  await tradeInVault.configureForge(await forge.getAddress());
  await tierPool.configureForge(await forge.getAddress());

  await forge
    .connect(recipeAdmin)
    .configureRecipe(RecipeKind.Recast, [10n, 2n, 0n, 0n], 0n, 100n, 20n, true);
  await forge
    .connect(recipeAdmin)
    .configureRecipe(RecipeKind.GuidedRecast, [15n, 3n, 0n, 2n], 0n, 100n, 20n, true);
  await forge
    .connect(recipeAdmin)
    .configureRecipe(RecipeKind.Ascension, [25n, 3n, 4n, 0n], 0n, 100n, 20n, true);
  await forge
    .connect(recipeAdmin)
    .configureRecipe(RecipeKind.GuidedAscension, [40n, 5n, 6n, 3n], 0n, 100n, 20n, true);
  await forge
    .connect(recipeAdmin)
    .configureRecipe(RecipeKind.SetAscension, [50n, 6n, 8n, 4n], 0n, 100n, 20n, true);
  await forge.connect(recipeAdmin).configureDustExchange(1n, 3n, 1n);

  const setA = ethers.id("forge-set-a");
  const setB = ethers.id("forge-set-b");
  const canonicalTradeA = ethers.id("canonical-trade-a");
  const canonicalTradeA2 = ethers.id("canonical-trade-a-2");
  const canonicalTradeB1 = ethers.id("canonical-trade-b-1");

  async function createInventoryToken(options: InventoryTokenOptions): Promise<bigint> {
    const tokenId = physicalTokenIdFor(options.inventoryId);
    const metadataUri = `ipfs://inventory/${options.inventoryId}.json`;
    await registry
      .connect(inventoryAdmin)
      .anchorInventory(
        options.inventoryId,
        ethers.id(`inventory:${options.inventoryId}:v1`),
        metadataUri,
        true,
        options.grailProtected ?? false
      );
    await registry.connect(tokenizer).markTokenized(options.inventoryId, options.owner.address);
    await itemToken
      .connect(minter)
      .mintInventoryItem(options.owner.address, tokenId, options.inventoryId, metadataUri);
    await collectiblePolicy
      .connect(policyAdmin)
      .setTokenPolicy(
        tokenId,
        options.canonicalKey,
        options.setKey,
        options.tier,
        options.tradeInEligible,
        options.tierPoolEligible
      );
    return tokenId;
  }

  const anchor = await createInventoryToken({
    inventoryId: "forge-anchor-a-tier-1",
    owner: player,
    canonicalKey: ethers.id("canonical-anchor-a"),
    setKey: setA,
    tier: 1,
    tradeInEligible: false,
    tierPoolEligible: false
  });
  const tradeA1 = await createInventoryToken({
    inventoryId: "forge-trade-a-1",
    owner: player,
    canonicalKey: canonicalTradeA,
    setKey: setA,
    tier: 1,
    tradeInEligible: true,
    tierPoolEligible: false
  });
  const tradeA2 = await createInventoryToken({
    inventoryId: "forge-trade-a-2",
    owner: player,
    canonicalKey: canonicalTradeA2,
    setKey: setA,
    tier: 1,
    tradeInEligible: true,
    tierPoolEligible: false
  });
  const tradeB1 = await createInventoryToken({
    inventoryId: "forge-trade-b-1",
    owner: player,
    canonicalKey: canonicalTradeB1,
    setKey: setB,
    tier: 1,
    tradeInEligible: true,
    tierPoolEligible: false
  });
  const proofA1 = await createInventoryToken({
    inventoryId: "forge-proof-a-1",
    owner: player,
    canonicalKey: canonicalTradeA,
    setKey: setA,
    tier: 1,
    tradeInEligible: false,
    tierPoolEligible: false
  });
  const proofA2 = await createInventoryToken({
    inventoryId: "forge-proof-a-2",
    owner: player,
    canonicalKey: canonicalTradeA2,
    setKey: setA,
    tier: 1,
    tradeInEligible: false,
    tierPoolEligible: false
  });
  const proofB1 = await createInventoryToken({
    inventoryId: "forge-proof-b-1",
    owner: player,
    canonicalKey: canonicalTradeB1,
    setKey: setB,
    tier: 1,
    tradeInEligible: false,
    tierPoolEligible: false
  });
  const wrongTierAnchor = await createInventoryToken({
    inventoryId: "forge-anchor-wrong-tier",
    owner: player,
    canonicalKey: ethers.id("canonical-anchor-tier-2"),
    setKey: setA,
    tier: 2,
    tradeInEligible: false,
    tierPoolEligible: false
  });

  const sameCanonicalOutput = await createInventoryToken({
    inventoryId: "forge-pool-tier-1-same-canonical",
    owner: poolAdmin,
    canonicalKey: canonicalTradeA,
    setKey: setA,
    tier: 1,
    tradeInEligible: false,
    tierPoolEligible: true
  });
  const tier1OutputA = await createInventoryToken({
    inventoryId: "forge-pool-tier-1-a",
    owner: poolAdmin,
    canonicalKey: ethers.id("canonical-tier-1-output-a"),
    setKey: setA,
    tier: 1,
    tradeInEligible: false,
    tierPoolEligible: true
  });
  const tier1OutputB = await createInventoryToken({
    inventoryId: "forge-pool-tier-1-b",
    owner: poolAdmin,
    canonicalKey: ethers.id("canonical-tier-1-output-b"),
    setKey: setB,
    tier: 1,
    tradeInEligible: false,
    tierPoolEligible: true
  });
  const tier1OutputC = await createInventoryToken({
    inventoryId: "forge-pool-tier-1-c",
    owner: poolAdmin,
    canonicalKey: ethers.id("canonical-tier-1-output-c"),
    setKey: setA,
    tier: 1,
    tradeInEligible: false,
    tierPoolEligible: true
  });
  const tier2OutputA = await createInventoryToken({
    inventoryId: "forge-pool-tier-2-a",
    owner: poolAdmin,
    canonicalKey: ethers.id("canonical-tier-2-output-a"),
    setKey: setA,
    tier: 2,
    tradeInEligible: false,
    tierPoolEligible: true
  });
  const tier2OutputB = await createInventoryToken({
    inventoryId: "forge-pool-tier-2-b",
    owner: poolAdmin,
    canonicalKey: ethers.id("canonical-tier-2-output-b"),
    setKey: setB,
    tier: 2,
    tradeInEligible: false,
    tierPoolEligible: true
  });
  const setTier2OutputA = await createInventoryToken({
    inventoryId: "forge-pool-set-a-tier-2",
    owner: poolAdmin,
    canonicalKey: ethers.id("canonical-set-a-tier-2-output"),
    setKey: setA,
    tier: 2,
    tradeInEligible: false,
    tierPoolEligible: true
  });

  await itemToken.connect(poolAdmin).setApprovalForAll(await tierPool.getAddress(), true);
  if (poolMode === "full") {
    for (const tokenId of [sameCanonicalOutput, tier1OutputA, tier1OutputB, tier1OutputC]) {
      await tierPool.connect(poolAdmin).deposit(tokenId, false);
    }
    for (const tokenId of [tier2OutputA, tier2OutputB]) {
      await tierPool.connect(poolAdmin).deposit(tokenId, false);
    }
    await tierPool.connect(poolAdmin).deposit(setTier2OutputA, true);
  } else {
    await tierPool.connect(poolAdmin).deposit(tier1OutputA, false);
  }

  await itemToken.connect(player).setApprovalForAll(await forge.getAddress(), true);
  await dustLedger
    .connect(dustOperator)
    .credit(player.address, [500n, 100n, 100n, 100n], ethers.id("initial-player-dust"));

  return {
    deployer,
    inventoryAdmin,
    tokenizer,
    minter,
    policyAdmin,
    poolAdmin,
    recipeAdmin,
    dustOperator,
    player,
    revealer,
    treasury,
    other,
    registry,
    itemToken,
    dustLedger,
    dustRewardPolicy,
    randomnessProvider,
    collectiblePolicy,
    tradeInVault,
    tierPool,
    passport,
    forge,
    setA,
    setB,
    canonicalTradeA,
    anchor,
    tradeA1,
    tradeA2,
    tradeB1,
    proofA1,
    proofA2,
    proofB1,
    wrongTierAnchor,
    sameCanonicalOutput,
    tier1OutputA,
    tier1OutputB,
    tier1OutputC,
    tier2OutputA,
    tier2OutputB,
    setTier2OutputA
  };
}

async function fulfillRandomness(fixture: Awaited<ReturnType<typeof deployVaultForgeFixture>>, claimId: bigint) {
  const claim = await fixture.forge.getClaim(claimId);
  const seed = ethers.id(`vault-forge-seed-${claimId}`);
  await fixture.randomnessProvider
    .connect(fixture.revealer)
    .commitRandomness(claim.requestId, commitmentFor(seed));
  await fixture.randomnessProvider
    .connect(fixture.revealer)
    .revealRandomness(claim.requestId, seed);
  await fixture.forge.connect(fixture.other).reveal(claimId);
}

describe("Vault Forge V4", function () {
  it("enforces Dust credit/spend replay protection and insufficient balances", async function () {
    const { dustLedger, dustOperator, other } = await deployVaultForgeFixture();
    const creditContext = ethers.id("dust-credit-replay");
    const spendContext = ethers.id("dust-spend-replay");
    const insufficientContext = ethers.id("dust-insufficient");

    await dustLedger.connect(dustOperator).credit(other.address, [5n, 4n, 0n, 0n], creditContext);
    await expect(
      dustLedger.connect(dustOperator).credit(other.address, [5n, 4n, 0n, 0n], creditContext)
    )
      .to.be.revertedWithCustomError(dustLedger, "CreditContextUsed")
      .withArgs(creditContext);

    await dustLedger.connect(dustOperator).spend(other.address, [2n, 1n, 0n, 0n], spendContext);
    await expect(
      dustLedger.connect(dustOperator).spend(other.address, [2n, 1n, 0n, 0n], spendContext)
    )
      .to.be.revertedWithCustomError(dustLedger, "SpendContextUsed")
      .withArgs(spendContext);

    await expect(
      dustLedger.connect(dustOperator).spend(other.address, [0n, 99n, 0n, 0n], insufficientContext)
    )
      .to.be.revertedWithCustomError(dustLedger, "InsufficientDust")
      .withArgs(other.address, DustKind.Echo, 99n, 3n);
    expect(await dustLedger.usedSpendContexts(insufficientContext)).to.equal(false);
    expect(await dustBalances(dustLedger, other.address)).to.deep.equal([3n, 3n, 0n, 0n]);
  });

  it("stores and deactivates a valid tier Dust reward policy", async function () {
    const { dustRewardPolicy, policyAdmin } = await deployVaultForgeFixture();

    await dustRewardPolicy
      .connect(policyAdmin)
      .createPolicy(100n, 10n, 3, 6_000, 3_000, 1_000);

    const policy = await dustRewardPolicy.getPolicy(1n);
    expect(policy.magicAmount).to.equal(100n);
    expect(policy.specialtyAmount).to.equal(10n);
    expect(policy.specialtyRolls).to.equal(3n);
    expect(policy.echoWeight).to.equal(6_000n);
    expect(policy.prismWeight).to.equal(3_000n);
    expect(policy.starWeight).to.equal(1_000n);
    expect(policy.active).to.equal(true);

    await dustRewardPolicy.connect(policyAdmin).deactivatePolicy(1n);
    expect((await dustRewardPolicy.getPolicy(1n)).active).to.equal(false);
  });

  it("rejects an unexpected direct transfer into trade-in custody", async function () {
    const { itemToken, tradeInVault, player, tradeA1 } = await deployVaultForgeFixture();

    await expect(
      itemToken
        .connect(player)
        .safeTransferFrom(player.address, await tradeInVault.getAddress(), tradeA1, 1n, "0x")
    ).to.be.revertedWithCustomError(tradeInVault, "UnexpectedERC1155Received");

    expect(await itemToken.balanceOf(player.address, tradeA1)).to.equal(1n);
    expect(await itemToken.balanceOf(await tradeInVault.getAddress(), tradeA1)).to.equal(0n);
  });

  it("onboards anchored redeemable custody inventory directly into a tier pool", async function () {
    const fixture = await deployVaultForgeFixture();
    const {
      registry,
      inventoryAdmin,
      policyAdmin,
      collectiblePolicy,
      tierPool,
      poolAdmin,
      itemToken,
      setA
    } = fixture;
    const inventoryId = "forge-direct-pool-custody";
    const tokenId = physicalTokenIdFor(inventoryId);
    const metadataUri = `ipfs://inventory/${inventoryId}.json`;

    await registry
      .connect(inventoryAdmin)
      .anchorInventory(inventoryId, ethers.id(`inventory:${inventoryId}:v1`), metadataUri, true, false);
    await collectiblePolicy
      .connect(policyAdmin)
      .setTokenPolicy(tokenId, ethers.id("direct-pool-canonical"), setA, 3, false, true);
    await expect(
      collectiblePolicy
        .connect(policyAdmin)
        .setTokenPolicy(tokenId, ethers.id("mutated-canonical"), setA, 3, false, true)
    )
      .to.be.revertedWithCustomError(collectiblePolicy, "PolicyAlreadySet")
      .withArgs(tokenId);

    await expect(tierPool.connect(poolAdmin).onboardInventory(inventoryId, false))
      .to.emit(tierPool, "PoolInventoryOnboarded")
      .withArgs(await tierPool.poolKeyFor(3, ethers.ZeroHash), tokenId, inventoryId);

    const record = await registry.getInventory(inventoryId);
    expect(record.tokenized).to.equal(true);
    expect(record.owner).to.equal(await tierPool.getAddress());
    expect(await itemToken.balanceOf(await tierPool.getAddress(), tokenId)).to.equal(1n);
    expect(await tierPool.tokenPoolKey(tokenId)).to.equal(await tierPool.poolKeyFor(3, ethers.ZeroHash));
  });

  it("requires retained same-identity proofs and a current-tier Anchor", async function () {
    const fixture = await deployVaultForgeFixture();
    const {
      forge,
      player,
      tradeA1,
      tradeA2,
      proofA1,
      proofA2,
      wrongTierAnchor
    } = fixture;

    await expect(
      forge
        .connect(player)
        .craft(RecipeKind.Recast, 0n, [tradeA1], [proofA2], ethers.id("wrong-proof"))
    )
      .to.be.revertedWithCustomError(forge, "InvalidDuplicateProof")
      .withArgs(tradeA1, proofA2);

    await expect(
      forge
        .connect(player)
        .craft(
          RecipeKind.Ascension,
          wrongTierAnchor,
          [tradeA1, tradeA2],
          [proofA1, proofA2],
          ethers.id("wrong-anchor-tier")
        )
    )
      .to.be.revertedWithCustomError(forge, "AnchorTierMismatch")
      .withArgs(wrongTierAnchor, 1n, 2n);

    expect(await forge.nextClaimId()).to.equal(1n);
  });

  it("recasts one eligible non-grail trade-in into a different same-tier card", async function () {
    const fixture = await deployVaultForgeFixture();
    const {
      forge,
      player,
      registry,
      collectiblePolicy,
      itemToken,
      tradeInVault,
      tierPool,
      tradeA1,
      proofA1,
      canonicalTradeA
    } = fixture;
    const claimId = await forge.nextClaimId();
    const dustBefore = await dustBalances(fixture.dustLedger, player.address);

    expect(await registry.isGrailProtectedToken(tradeA1)).to.equal(false);
    expect((await collectiblePolicy.getTokenPolicy(tradeA1)).tradeInEligible).to.equal(true);

    await forge
      .connect(player)
      .craft(RecipeKind.Recast, 0n, [tradeA1], [proofA1], ethers.id("recast-imprint"));

    const pendingClaim = await forge.getClaim(claimId);
    const reservation = await tierPool.reservations(claimId);
    expect(pendingClaim.status).to.equal(ClaimStatus.PendingRandomness);
    expect(pendingClaim.inputTier).to.equal(1n);
    expect(pendingClaim.outputTier).to.equal(1n);
    expect(reservation.optionCount).to.equal(1n);
    expect(reservation.excludedCanonicalKey).to.equal(canonicalTradeA);
    expect(await itemToken.balanceOf(player.address, tradeA1)).to.equal(0n);
    expect(await itemToken.balanceOf(player.address, proofA1)).to.equal(1n);
    expect(await itemToken.balanceOf(await tradeInVault.getAddress(), tradeA1)).to.equal(1n);
    expect(await tradeInVault.pendingClaimByToken(tradeA1)).to.equal(claimId);
    expect(await dustBalances(fixture.dustLedger, player.address)).to.deep.equal([
      dustBefore[0]! - 10n,
      dustBefore[1]! - 2n,
      dustBefore[2]!,
      dustBefore[3]!
    ]);

    await fulfillRandomness(fixture, claimId);

    const settledClaim = await forge.getClaim(claimId);
    const outputPolicy = await collectiblePolicy.getTokenPolicy(settledClaim.outputTokenId);
    expect(settledClaim.status).to.equal(ClaimStatus.Settled);
    expect(outputPolicy.tier).to.equal(1n);
    expect(outputPolicy.canonicalKey).to.not.equal(canonicalTradeA);
    expect(await itemToken.balanceOf(player.address, settledClaim.outputTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(await tradeInVault.getAddress(), tradeA1)).to.equal(1n);
    expect(await tradeInVault.pendingClaimByToken(tradeA1)).to.equal(0n);
    expect((await tierPool.reservations(claimId)).exists).to.equal(false);
  });

  it("prepares two Guided Recast candidates and lets the wallet choose one", async function () {
    const fixture = await deployVaultForgeFixture();
    const {
      forge,
      player,
      poolAdmin,
      itemToken,
      tierPool,
      collectiblePolicy,
      tradeA1,
      proofA1,
      tier1OutputA,
      canonicalTradeA
    } = fixture;
    const claimId = await forge.nextClaimId();

    await forge
      .connect(player)
      .craft(RecipeKind.GuidedRecast, 0n, [tradeA1], [proofA1], ethers.id("guided-recast-imprint"));
    const poolKey = await tierPool.poolKeyFor(1, ethers.ZeroHash);
    await expect(tierPool.connect(poolAdmin).withdrawAvailable(tier1OutputA, poolAdmin.address))
      .to.be.revertedWithCustomError(tierPool, "TokenReservationConflict")
      .withArgs(poolKey);
    await fulfillRandomness(fixture, claimId);

    const awaitingChoice = await forge.getClaim(claimId);
    const candidates = await forge.getClaimCandidates(claimId);
    expect(awaitingChoice.status).to.equal(ClaimStatus.AwaitingChoice);
    expect(candidates).to.have.length(2);
    expect(candidates[0]).to.not.equal(candidates[1]);
    for (const candidate of candidates) {
      expect((await collectiblePolicy.getTokenPolicy(candidate)).canonicalKey).to.not.equal(
        canonicalTradeA
      );
      expect(await itemToken.balanceOf(player.address, candidate)).to.equal(0n);
    }

    const selected = candidates[1];
    const returned = candidates[0];
    await forge.connect(player).selectCandidate(claimId, 1n, player.address);

    const settledClaim = await forge.getClaim(claimId);
    expect(settledClaim.status).to.equal(ClaimStatus.Settled);
    expect(settledClaim.outputTokenId).to.equal(selected);
    expect(await itemToken.balanceOf(player.address, selected)).to.equal(1n);
    expect(await tierPool.tokenPoolKey(selected)).to.equal(ethers.ZeroHash);
    expect(await tierPool.tokenPoolKey(returned)).to.equal(awaitingChoice.poolKey);
    expect(await forge.getClaimCandidates(claimId)).to.deep.equal([]);
  });

  it("retains the Anchor and advances Passport only when Ascension settles", async function () {
    const fixture = await deployVaultForgeFixture();
    const {
      forge,
      player,
      itemToken,
      tradeInVault,
      collectiblePolicy,
      passport,
      anchor,
      tradeA1,
      tradeA2,
      proofA1,
      proofA2
    } = fixture;
    const claimId = await forge.nextClaimId();

    await forge
      .connect(player)
      .craft(
        RecipeKind.Ascension,
        anchor,
        [tradeA1, tradeA2],
        [proofA1, proofA2],
        ethers.id("ascension-imprint")
      );

    expect(await itemToken.balanceOf(player.address, anchor)).to.equal(1n);
    expect(await itemToken.balanceOf(player.address, proofA1)).to.equal(1n);
    expect(await itemToken.balanceOf(player.address, proofA2)).to.equal(1n);
    expect(await itemToken.balanceOf(player.address, tradeA1)).to.equal(0n);
    expect(await itemToken.balanceOf(player.address, tradeA2)).to.equal(0n);
    expect(await itemToken.balanceOf(await tradeInVault.getAddress(), tradeA1)).to.equal(1n);
    expect(await itemToken.balanceOf(await tradeInVault.getAddress(), tradeA2)).to.equal(1n);
    expect(await passport.rankOf(player.address)).to.equal(1n);
    expect(await forge.activeAscensionClaim(player.address)).to.equal(claimId);

    await fulfillRandomness(fixture, claimId);

    const settledClaim = await forge.getClaim(claimId);
    const outputPolicy = await collectiblePolicy.getTokenPolicy(settledClaim.outputTokenId);
    expect(settledClaim.status).to.equal(ClaimStatus.Settled);
    expect(outputPolicy.tier).to.equal(2n);
    expect(await itemToken.balanceOf(player.address, settledClaim.outputTokenId)).to.equal(1n);
    expect(await itemToken.balanceOf(player.address, anchor)).to.equal(1n);
    expect(await passport.rankOf(player.address)).to.equal(2n);
    expect(await passport.latestAnchorTokenId(player.address)).to.equal(anchor);
    expect(await passport.latestAscensionClaimId(player.address)).to.equal(claimId);
    expect(await forge.activeAscensionClaim(player.address)).to.equal(0n);
    expect(await tradeInVault.pendingClaimByToken(tradeA1)).to.equal(0n);
    expect(await tradeInVault.pendingClaimByToken(tradeA2)).to.equal(0n);
  });

  it("requires matching sets for Set Ascension and routes a valid craft to that set pool", async function () {
    const fixture = await deployVaultForgeFixture();
    const {
      forge,
      player,
      itemToken,
      collectiblePolicy,
      anchor,
      tradeA1,
      tradeA2,
      tradeB1,
      proofA1,
      proofA2,
      proofB1,
      setA,
      setB,
      setTier2OutputA
    } = fixture;
    const dustBefore = await dustBalances(fixture.dustLedger, player.address);

    await expect(
      forge
        .connect(player)
        .craft(
          RecipeKind.SetAscension,
          anchor,
          [tradeA1, tradeB1],
          [proofA1, proofB1],
          ethers.id("set-mismatch-imprint")
        )
    )
      .to.be.revertedWithCustomError(forge, "SetMismatch")
      .withArgs(tradeB1, setA, setB);

    expect(await itemToken.balanceOf(player.address, tradeA1)).to.equal(1n);
    expect(await itemToken.balanceOf(player.address, tradeB1)).to.equal(1n);
    expect(await dustBalances(fixture.dustLedger, player.address)).to.deep.equal(dustBefore);
    expect(await forge.nextClaimId()).to.equal(1n);

    await forge
      .connect(player)
      .craft(
        RecipeKind.SetAscension,
        anchor,
        [tradeA1, tradeA2],
        [proofA1, proofA2],
        ethers.id("set-ascension-imprint")
      );
    await fulfillRandomness(fixture, 1n);

    const settledClaim = await forge.getClaim(1n);
    const outputPolicy = await collectiblePolicy.getTokenPolicy(settledClaim.outputTokenId);
    expect(settledClaim.outputTokenId).to.equal(setTier2OutputA);
    expect(outputPolicy.setKey).to.equal(setA);
    expect(outputPolicy.tier).to.equal(2n);
  });

  it("exchanges Magic plus three specialty Dust for the selected specialty", async function () {
    const { forge, dustLedger, player } = await deployVaultForgeFixture();

    await expect(forge.connect(player).exchangeDust(DustKind.Echo, DustKind.Star))
      .to.emit(forge, "DustExchanged")
      .withArgs(player.address, DustKind.Echo, DustKind.Star, 3n, 1n);

    expect(await dustBalances(dustLedger, player.address)).to.deep.equal([499n, 97n, 100n, 101n]);
    expect(await forge.dustExchangeNonces(player.address)).to.equal(1n);
  });

  it("reverts atomically when the pool cannot reserve every Guided Recast option", async function () {
    const fixture = await deployVaultForgeFixture("limited-recast");
    const { forge, player, itemToken, tradeInVault, tierPool, tradeA1, proofA1 } = fixture;
    const dustBefore = await dustBalances(fixture.dustLedger, player.address);
    const poolKey = await tierPool.poolKeyFor(1, ethers.ZeroHash);

    await expect(
      forge
        .connect(player)
        .craft(
          RecipeKind.GuidedRecast,
          0n,
          [tradeA1],
          [proofA1],
          ethers.id("insufficient-pool-imprint")
        )
    )
      .to.be.revertedWithCustomError(tierPool, "InsufficientPoolInventory")
      .withArgs(poolKey, 2n, 1n);

    expect(await forge.nextClaimId()).to.equal(1n);
    expect(await itemToken.balanceOf(player.address, tradeA1)).to.equal(1n);
    expect(await itemToken.balanceOf(await tradeInVault.getAddress(), tradeA1)).to.equal(0n);
    expect(await dustBalances(fixture.dustLedger, player.address)).to.deep.equal(dustBefore);
    expect((await tierPool.pools(poolKey)).reservedOptions).to.equal(0n);
  });

  it("cancels expired randomness and restores exact trade-ins and Dust without advancing rank", async function () {
    const fixture = await deployVaultForgeFixture();
    const {
      forge,
      deployer,
      player,
      other,
      itemToken,
      tradeInVault,
      tierPool,
      passport,
      recipeAdmin,
      dustLedger,
      anchor,
      tradeA1,
      tradeA2,
      proofA1,
      proofA2
    } = fixture;
    const dustBefore = await dustBalances(fixture.dustLedger, player.address);
    const poolCountBefore = await tierPool.availableCount(2, ethers.ZeroHash);
    const claimId = await forge.nextClaimId();
    const fee = 1_234n;

    await forge
      .connect(recipeAdmin)
      .configureRecipe(RecipeKind.Ascension, [25n, 3n, 4n, 0n], fee, 100n, 20n, true);

    await forge
      .connect(player)
      .craft(
        RecipeKind.Ascension,
        anchor,
        [tradeA1, tradeA2],
        [proofA1, proofA2],
        ethers.id("expiring-ascension-imprint"),
        { value: fee }
      );

    const pendingClaim = await forge.getClaim(claimId);
    expect(pendingClaim.status).to.equal(ClaimStatus.PendingRandomness);
    expect(await dustBalances(fixture.dustLedger, player.address)).to.deep.equal([
      dustBefore[0]! - 25n,
      dustBefore[1]! - 3n,
      dustBefore[2]! - 4n,
      dustBefore[3]!
    ]);
    expect(await itemToken.balanceOf(player.address, tradeA1)).to.equal(0n);
    expect(await itemToken.balanceOf(player.address, tradeA2)).to.equal(0n);
    expect(await passport.rankOf(player.address)).to.equal(1n);

    const timeout = await forge.RANDOMNESS_TIMEOUT();
    await ethers.provider.send("evm_increaseTime", [Number(timeout) + 1]);
    await ethers.provider.send("evm_mine", []);
    await dustLedger.connect(deployer).pause();
    await forge.connect(other).cancelExpired(claimId);

    const cancelledClaim = await forge.getClaim(claimId);
    expect(cancelledClaim.status).to.equal(ClaimStatus.Cancelled);
    expect(await itemToken.balanceOf(player.address, tradeA1)).to.equal(1n);
    expect(await itemToken.balanceOf(player.address, tradeA2)).to.equal(1n);
    expect(await itemToken.balanceOf(await tradeInVault.getAddress(), tradeA1)).to.equal(0n);
    expect(await itemToken.balanceOf(await tradeInVault.getAddress(), tradeA2)).to.equal(0n);
    expect(await tradeInVault.pendingClaimByToken(tradeA1)).to.equal(0n);
    expect(await tradeInVault.pendingClaimByToken(tradeA2)).to.equal(0n);
    expect(await dustBalances(fixture.dustLedger, player.address)).to.deep.equal(dustBefore);
    expect(await dustLedger.totalRestored(player.address, DustKind.Magic)).to.equal(25n);
    expect(await dustLedger.totalRestored(player.address, DustKind.Echo)).to.equal(3n);
    expect(await dustLedger.totalRestored(player.address, DustKind.Prism)).to.equal(4n);
    expect(await passport.rankOf(player.address)).to.equal(1n);
    expect(await passport.latestAscensionClaimId(player.address)).to.equal(0n);
    expect(await forge.activeAscensionClaim(player.address)).to.equal(0n);
    expect(await forge.totalClaimsByRecipe(RecipeKind.Ascension)).to.equal(0n);
    expect(await forge.walletClaimsByRecipe(RecipeKind.Ascension, player.address)).to.equal(0n);
    expect(await forge.refundCredit(player.address)).to.equal(fee);
    expect(await forge.treasuryFeesCredit(fixture.treasury.address)).to.equal(0n);
    expect(await tierPool.availableCount(2, ethers.ZeroHash)).to.equal(poolCountBefore);
    expect((await tierPool.reservations(claimId)).exists).to.equal(false);

    await expect(forge.connect(player).withdrawRefund(other.address)).to.changeEtherBalances(
      [forge, other],
      [-fee, fee]
    );
    expect(await forge.refundCredit(player.address)).to.equal(0n);
  });
});
