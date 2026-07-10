import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";
import type { BaseContract } from "ethers";
import { resolveRandomnessSmokePlan } from "./smoke-randomness";
import { resolveSmokeRolePlan } from "./smoke-roles";

type DeploymentFile = {
  chainId: number;
  deployer: string;
  randomnessProviderKind?: unknown;
  randomnessCoordinator?: unknown;
  launchState?: unknown;
  roleHolders?: unknown;
  contracts: Record<string, string>;
};

type RoleReadableContract = BaseContract & {
  DEFAULT_ADMIN_ROLE(): Promise<string>;
  hasRole(role: string, account: string): Promise<boolean>;
};

type InventoryRegistryContract = RoleReadableContract & {
  INVENTORY_ADMIN_ROLE(): Promise<string>;
  TOKENIZER_ROLE(): Promise<string>;
  derivePhysicalTokenId(inventoryId: string): Promise<bigint>;
};

type ItemTokenContract = RoleReadableContract & {
  MINTER_ROLE(): Promise<string>;
  BURNER_ROLE(): Promise<string>;
  URI_SETTER_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  paused(): Promise<boolean>;
};

type RandomnessProviderContract = RoleReadableContract & {
  REQUESTER_ROLE(): Promise<string>;
  readRandomness(requestId: string): Promise<[boolean, bigint]>;
};

type CommitRevealRandomnessProviderContract = RandomnessProviderContract & {
  REVEALER_ROLE(): Promise<string>;
};

type CoordinatorRandomnessProviderContract = RandomnessProviderContract & {
  FUND_ADMIN_ROLE(): Promise<string>;
  coordinator(): Promise<string>;
  coordinatorCodeHash(): Promise<string>;
  maxRequestFee(): Promise<bigint>;
};

type PackSaleContract = RoleReadableContract & {
  DROP_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  paused(): Promise<boolean>;
  REFUND_TIMEOUT(): Promise<bigint>;
  inventoryRegistry(): Promise<string>;
  itemToken(): Promise<string>;
  randomnessProvider(): Promise<string>;
  treasury(): Promise<string>;
  dustLedger(): Promise<string>;
  dustRewardPolicy(): Promise<string>;
  dropDustPolicyId(dropId: bigint): Promise<bigint>;
  nextDropId(): Promise<bigint>;
  getDropBonus(dropId: bigint): Promise<[bigint[], bigint[], string[]]>;
};

type MarketplaceContract = RoleReadableContract & {
  MARKET_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  paused(): Promise<boolean>;
  itemToken(): Promise<string>;
  treasury(): Promise<string>;
  feeBps(): Promise<bigint>;
  nextListingId(): Promise<bigint>;
};

type BuybackVaultContract = RoleReadableContract & {
  BUYBACK_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  paused(): Promise<boolean>;
  itemToken(): Promise<string>;
  totalPayoutCredit(): Promise<bigint>;
  quotes(tokenId: bigint): Promise<readonly [bigint, boolean] & { price: bigint; active: boolean }>;
};

type ForgeRecipeView = {
  status: bigint;
  outputTokenId: bigint;
  fee: bigint;
  maxTotalCrafts: bigint;
  maxCraftsPerWallet: bigint;
  outputSupplyCap: bigint;
  exists: boolean;
};

type ForgeContract = RoleReadableContract & {
  RECIPE_ADMIN_ROLE(): Promise<string>;
  CRAFT_REVIEWER_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  itemToken(): Promise<string>;
  inventoryRegistry(): Promise<string>;
  treasury(): Promise<string>;
  paused(): Promise<boolean>;
  nextRecipeId(): Promise<bigint>;
  recipes(recipeId: bigint): Promise<ForgeRecipeView>;
  getRecipeInputs(recipeId: bigint): Promise<[bigint[], bigint[]]>;
  getRecipeCatalysts(recipeId: bigint): Promise<[bigint[], bigint[]]>;
};

type RedemptionRegistryContract = RoleReadableContract & {
  REDEMPTION_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  paused(): Promise<boolean>;
  itemToken(): Promise<string>;
  inventoryRegistry(): Promise<string>;
  nextRequestId(): Promise<bigint>;
};

type DustLedgerContract = RoleReadableContract & {
  CREDIT_ROLE(): Promise<string>;
  SPENDER_ROLE(): Promise<string>;
  RESTORER_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  paused(): Promise<boolean>;
};

type DustPolicyView = {
  magicAmount: bigint;
  specialtyAmount: bigint;
  specialtyRolls: bigint;
  echoWeight: bigint;
  prismWeight: bigint;
  starWeight: bigint;
  active: boolean;
  exists: boolean;
};

type DustRewardPolicyContract = RoleReadableContract & {
  POLICY_ADMIN_ROLE(): Promise<string>;
  nextPolicyId(): Promise<bigint>;
  getPolicy(policyId: bigint): Promise<DustPolicyView>;
};

type CollectiblePolicyView = {
  canonicalKey: string;
  setKey: string;
  tier: bigint;
  tradeInEligible: boolean;
  tierPoolEligible: boolean;
  exists: boolean;
};

type CollectibleForgePolicyContract = RoleReadableContract & {
  POLICY_ADMIN_ROLE(): Promise<string>;
  inventoryRegistry(): Promise<string>;
  getTokenPolicy(tokenId: bigint): Promise<CollectiblePolicyView>;
};

type TradeInVaultContract = RoleReadableContract & {
  CUSTODY_ADMIN_ROLE(): Promise<string>;
  itemToken(): Promise<string>;
  forge(): Promise<string>;
};

type TierPoolContract = RoleReadableContract & {
  POOL_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  paused(): Promise<boolean>;
  itemToken(): Promise<string>;
  inventoryRegistry(): Promise<string>;
  collectiblePolicy(): Promise<string>;
  forge(): Promise<string>;
};

type VaultPassportContract = RoleReadableContract & {
  FORGE_ROLE(): Promise<string>;
};

type VaultForgeRecipeView = {
  dustAmounts: readonly bigint[];
  fee: bigint;
  maxTotalClaims: bigint;
  maxClaimsPerWallet: bigint;
  version: bigint;
  tradeInCount: bigint;
  optionCount: bigint;
  active: boolean;
};

type VaultForgeContract = RoleReadableContract & {
  RECIPE_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  paused(): Promise<boolean>;
  itemToken(): Promise<string>;
  inventoryRegistry(): Promise<string>;
  collectiblePolicy(): Promise<string>;
  dustLedger(): Promise<string>;
  tradeInVault(): Promise<string>;
  tierPool(): Promise<string>;
  passport(): Promise<string>;
  randomnessProvider(): Promise<string>;
  treasury(): Promise<string>;
  getRecipeConfig(recipeKind: bigint): Promise<VaultForgeRecipeView>;
  exchangeMagicCost(): Promise<bigint>;
  exchangeInputAmount(): Promise<bigint>;
  exchangeOutputAmount(): Promise<bigint>;
};

const contractNames = [
  "InventoryRegistry",
  "ItemToken",
  "CommitRevealRandomnessProvider",
  "PackSale",
  "Marketplace",
  "BuybackVault",
  "Forge",
  "RedemptionRegistry",
  "DustLedger",
  "DustRewardPolicy",
  "CollectibleForgePolicy",
  "TradeInVault",
  "TierPool",
  "VaultPassport",
  "VaultForge"
] as const;

const sampleDropInventoryId = "inv-sample-graded-001";
const expectedMarketplaceFeeBps = 250n;
const expectedBuybackQuote = ethers.parseEther("0.004");
const expectedStarterTokenIds = [7_001n, 7_002n] as const;
const expectedStarterAmounts = [3n, 1n] as const;
const fireShardTokenId = 7_001n;
const vaultSealTokenId = 7_002n;
const forgeDustTokenId = 7_003n;
const resonanceDustTokenId = 7_004n;
const signalBadgeTokenId = 9_001n;
const resonanceAuraTokenId = 9_002n;
const curatorSigilTokenId = 9_003n;
const expectedDustPolicy = {
  magicAmount: 100n,
  specialtyAmount: 10n,
  specialtyRolls: 2n,
  echoWeight: 5_000n,
  prismWeight: 3_500n,
  starWeight: 1_500n
} as const;

const expectedVaultForgeRecipes = [
  { dust: [5n, 10n, 0n, 0n], fee: ethers.parseEther("0.0005"), maxTotal: 1_000n, maxWallet: 100n, tradeIns: 1n, options: 1n },
  { dust: [8n, 12n, 0n, 4n], fee: ethers.parseEther("0.001"), maxTotal: 500n, maxWallet: 50n, tradeIns: 1n, options: 2n },
  { dust: [15n, 10n, 6n, 0n], fee: ethers.parseEther("0.0015"), maxTotal: 250n, maxWallet: 10n, tradeIns: 2n, options: 1n },
  { dust: [20n, 12n, 8n, 6n], fee: ethers.parseEther("0.0025"), maxTotal: 100n, maxWallet: 5n, tradeIns: 2n, options: 3n },
  { dust: [24n, 12n, 10n, 8n], fee: ethers.parseEther("0.002"), maxTotal: 100n, maxWallet: 5n, tradeIns: 2n, options: 1n }
] as const;

type ExpectedForgeRecipe = {
  recipeId: bigint;
  inputTokenIds: readonly bigint[];
  inputAmounts: readonly bigint[];
  catalystTokenIds: readonly bigint[];
  catalystAmounts: readonly bigint[];
  outputTokenId: bigint;
  fee: bigint;
  maxTotalCrafts: bigint;
  maxCraftsPerWallet: bigint;
  outputSupplyCap: bigint;
};

function deploymentsPath(networkName: string): string {
  return path.resolve(__dirname, "../../../deployments", `${networkName}.json`);
}

function loadDeployment(): DeploymentFile {
  const deploymentPath = deploymentsPath(network.name);
  if (!existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }

  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as DeploymentFile;
  if (!ethers.isAddress(deployment.deployer)) {
    throw new Error(`Deployment file has invalid deployer address: ${deployment.deployer}`);
  }

  return deployment;
}

function requireAddress(deployment: DeploymentFile, name: string): string {
  const address = deployment.contracts[name];
  if (!address) {
    throw new Error(`Missing deployed address for ${name}`);
  }

  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid deployed address for ${name}: ${address}`);
  }

  return address;
}

async function assertBytecode(name: string, address: string): Promise<void> {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(`${name} at ${address} has no bytecode`);
  }

  console.log(`${name}: bytecode present at ${address}`);
}

async function assertAddressEq(
  label: string,
  actual: Promise<string>,
  expected: string
): Promise<void> {
  const actualAddress = await actual;
  if (actualAddress.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} expected ${expected} got ${actualAddress}`);
  }
}

async function assertRole(
  contract: RoleReadableContract,
  role: string,
  account: string,
  label: string
): Promise<void> {
  if (!(await contract.hasRole(role, account))) {
    throw new Error(`${label} is missing for ${account}`);
  }
}

async function assertHandoffRole(
  contract: RoleReadableContract,
  role: string,
  expectedHolder: string,
  deployer: string,
  label: string
): Promise<void> {
  await assertRole(contract, role, expectedHolder, label);
  if (
    expectedHolder.toLowerCase() !== deployer.toLowerCase() &&
    (await contract.hasRole(role, deployer))
  ) {
    throw new Error(`${label} was not revoked from deployer ${deployer}`);
  }
}

async function assertDefaultAdmin(
  contract: RoleReadableContract,
  expectedAdmin: string,
  label: string,
  deployer: string = expectedAdmin
): Promise<void> {
  await assertHandoffRole(
    contract,
    await contract.DEFAULT_ADMIN_ROLE(),
    expectedAdmin,
    deployer,
    `${label}.DEFAULT_ADMIN_ROLE`
  );
}

async function assertPaused(contract: { paused(): Promise<boolean> }, label: string): Promise<void> {
  if (!(await contract.paused())) {
    throw new Error(`${label} must be paused for the mainnet canary handoff`);
  }
}

function arraysMatch(actual: readonly bigint[], expected: readonly bigint[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function main(): Promise<void> {
  const deployment = loadDeployment();
  const isProductionFork = process.env.GACHA_MAINNET_FORK_REHEARSAL === "true";
  const effectiveNetworkName = isProductionFork ? "robinhoodMainnet" : network.name;
  const randomnessPlan = resolveRandomnessSmokePlan(
    deployment,
    effectiveNetworkName,
    process.env
  );
  const rolePlan = resolveSmokeRolePlan(
    deployment.deployer,
    effectiveNetworkName,
    process.env
  );
  const chain = await ethers.provider.getNetwork();
  if (deployment.chainId !== Number(chain.chainId)) {
    throw new Error(
      `Deployment file chainId ${deployment.chainId} does not match provider chainId ${chain.chainId}`
    );
  }

  const deployer = rolePlan.deployer;
  const addresses = Object.fromEntries(
    contractNames.map((name) => [name, requireAddress(deployment, name)])
  ) as Record<(typeof contractNames)[number], string>;

  for (const name of contractNames) {
    await assertBytecode(
      name === "CommitRevealRandomnessProvider" ? randomnessPlan.label : name,
      addresses[name]
    );
  }

  const inventoryRegistry = (await ethers.getContractAt(
    "InventoryRegistry",
    addresses.InventoryRegistry
  )) as unknown as InventoryRegistryContract;
  const itemToken = (await ethers.getContractAt(
    "ItemToken",
    addresses.ItemToken
  )) as unknown as ItemTokenContract;
  const randomnessProvider = (await ethers.getContractAt(
    randomnessPlan.artifactName,
    addresses.CommitRevealRandomnessProvider
  )) as unknown as RandomnessProviderContract;
  const packSale = (await ethers.getContractAt(
    "PackSale",
    addresses.PackSale
  )) as unknown as PackSaleContract;
  const marketplace = (await ethers.getContractAt(
    "Marketplace",
    addresses.Marketplace
  )) as unknown as MarketplaceContract;
  const buybackVault = (await ethers.getContractAt(
    "BuybackVault",
    addresses.BuybackVault
  )) as unknown as BuybackVaultContract;
  const forge = (await ethers.getContractAt(
    "Forge",
    addresses.Forge
  )) as unknown as ForgeContract;
  const redemptionRegistry = (await ethers.getContractAt(
    "RedemptionRegistry",
    addresses.RedemptionRegistry
  )) as unknown as RedemptionRegistryContract;
  const dustLedger = (await ethers.getContractAt(
    "DustLedger",
    addresses.DustLedger
  )) as unknown as DustLedgerContract;
  const dustRewardPolicy = (await ethers.getContractAt(
    "DustRewardPolicy",
    addresses.DustRewardPolicy
  )) as unknown as DustRewardPolicyContract;
  const collectibleForgePolicy = (await ethers.getContractAt(
    "CollectibleForgePolicy",
    addresses.CollectibleForgePolicy
  )) as unknown as CollectibleForgePolicyContract;
  const tradeInVault = (await ethers.getContractAt(
    "TradeInVault",
    addresses.TradeInVault
  )) as unknown as TradeInVaultContract;
  const tierPool = (await ethers.getContractAt(
    "TierPool",
    addresses.TierPool
  )) as unknown as TierPoolContract;
  const vaultPassport = (await ethers.getContractAt(
    "VaultPassport",
    addresses.VaultPassport
  )) as unknown as VaultPassportContract;
  const vaultForge = (await ethers.getContractAt(
    "VaultForge",
    addresses.VaultForge
  )) as unknown as VaultForgeContract;

  await inventoryRegistry.DEFAULT_ADMIN_ROLE();
  await itemToken.DEFAULT_ADMIN_ROLE();
  await marketplace.feeBps();
  await forge.paused();

  await randomnessProvider.REQUESTER_ROLE();
  await randomnessProvider.readRandomness(ethers.ZeroHash);
  let commitRevealRandomnessProvider: CommitRevealRandomnessProviderContract | undefined;
  let coordinatorRandomnessProvider: CoordinatorRandomnessProviderContract | undefined;
  if (randomnessPlan.kind === "commit-reveal-demo") {
    commitRevealRandomnessProvider =
      randomnessProvider as CommitRevealRandomnessProviderContract;
    await commitRevealRandomnessProvider.REVEALER_ROLE();
  } else {
    coordinatorRandomnessProvider =
      randomnessProvider as CoordinatorRandomnessProviderContract;
    await assertAddressEq(
      "CoordinatorRandomnessProvider.coordinator",
      coordinatorRandomnessProvider.coordinator(),
      randomnessPlan.coordinator
    );
    const configuredCodeHash = (await coordinatorRandomnessProvider.coordinatorCodeHash()).toLowerCase();
    if (configuredCodeHash !== randomnessPlan.coordinatorCodeHash) {
      throw new Error(
        `CoordinatorRandomnessProvider.coordinatorCodeHash expected ${randomnessPlan.coordinatorCodeHash} got ${configuredCodeHash}`
      );
    }
    const coordinatorCode = await ethers.provider.getCode(randomnessPlan.coordinator);
    const actualCodeHash = ethers.keccak256(coordinatorCode).toLowerCase();
    if (coordinatorCode === "0x" || actualCodeHash !== randomnessPlan.coordinatorCodeHash) {
      throw new Error(
        `Randomness coordinator bytecode hash expected ${randomnessPlan.coordinatorCodeHash} got ${actualCodeHash}`
      );
    }
    const configuredMaxRequestFee = await coordinatorRandomnessProvider.maxRequestFee();
    if (configuredMaxRequestFee !== randomnessPlan.maxRequestFeeWei) {
      throw new Error(
        `CoordinatorRandomnessProvider.maxRequestFee expected ${randomnessPlan.maxRequestFeeWei} got ${configuredMaxRequestFee}`
      );
    }
    await coordinatorRandomnessProvider.FUND_ADMIN_ROLE();
  }
  await packSale.REFUND_TIMEOUT();
  await packSale.nextDropId();
  await marketplace.nextListingId();
  await buybackVault.totalPayoutCredit();
  await forge.nextRecipeId();
  await redemptionRegistry.nextRequestId();
  await dustRewardPolicy.nextPolicyId();
  await vaultForge.getRecipeConfig(0n);
  await vaultForge.exchangeMagicCost();

  if (effectiveNetworkName === "robinhoodMainnet") {
    if (deployment.launchState !== "paused") {
      throw new Error("Production deployment registry launchState must be paused");
    }
    const roleHolders = deployment.roleHolders;
    if (
      typeof roleHolders !== "object" ||
      roleHolders === null ||
      Array.isArray(roleHolders)
    ) {
      throw new Error("Production deployment registry roleHolders are required");
    }
    const expectedRoleHolders = {
      protocolAdmin: rolePlan.protocolAdmin,
      operations: rolePlan.operations,
      guardian: rolePlan.guardian,
      treasury: rolePlan.treasury
    };
    for (const [label, expected] of Object.entries(expectedRoleHolders)) {
      const actual = (roleHolders as Record<string, unknown>)[label];
      if (
        typeof actual !== "string" ||
        !ethers.isAddress(actual) ||
        ethers.getAddress(actual) !== expected
      ) {
        throw new Error(`Production deployment roleHolders.${label} does not match ${expected}`);
      }
      if ((await ethers.provider.getCode(expected)) === "0x") {
        throw new Error(`Production role holder ${label} at ${expected} has no contract code`);
      }
    }
    await Promise.all([
      assertPaused(itemToken, "ItemToken"),
      assertPaused(packSale, "PackSale"),
      assertPaused(marketplace, "Marketplace"),
      assertPaused(buybackVault, "BuybackVault"),
      assertPaused(forge, "Forge"),
      assertPaused(redemptionRegistry, "RedemptionRegistry"),
      assertPaused(dustLedger, "DustLedger"),
      assertPaused(tierPool, "TierPool"),
      assertPaused(vaultForge, "VaultForge")
    ]);
  }

  const expectsSampleSeed =
    effectiveNetworkName === "localhost" || effectiveNetworkName === "robinhoodTestnet";
  if (expectsSampleSeed) {
    const nextDropId = await packSale.nextDropId();
    if (nextDropId <= 1n) {
      throw new Error("PackSale seed drop is missing");
    }

    const [bonusTokenIds, bonusAmounts, bonusUris] = await packSale.getDropBonus(1n);
    if (bonusTokenIds.length !== bonusAmounts.length || bonusTokenIds.length !== bonusUris.length) {
      throw new Error("PackSale drop 1 bonus bundle arrays are inconsistent");
    }
    if (
      bonusTokenIds.length !== expectedStarterTokenIds.length
        || bonusTokenIds.some((tokenId, index) => tokenId !== expectedStarterTokenIds[index])
        || bonusAmounts.some((amount, index) => amount !== expectedStarterAmounts[index])
    ) {
      throw new Error("PackSale drop 1 does not contain the reviewed starter-material bundle");
    }
    if ((await marketplace.feeBps()) !== expectedMarketplaceFeeBps) {
      throw new Error(`Marketplace fee must be ${expectedMarketplaceFeeBps} bps after seed`);
    }

    const physicalTokenId = await inventoryRegistry.derivePhysicalTokenId(sampleDropInventoryId);
    const quote = await buybackVault.quotes(physicalTokenId);
    if (!quote.active || quote.price !== expectedBuybackQuote) {
      throw new Error("BuybackVault sample quote is missing or mismatched");
    }
    const payoutCredit = await buybackVault.totalPayoutCredit();
    const buybackBalance = await ethers.provider.getBalance(addresses.BuybackVault);
    if (buybackBalance < payoutCredit || buybackBalance - payoutCredit < expectedBuybackQuote) {
      throw new Error("BuybackVault does not have one unreserved sample-quote payout available");
    }

    const expectedForgeRecipes: ExpectedForgeRecipe[] = [
      {
        recipeId: 1n,
        inputTokenIds: [fireShardTokenId],
        inputAmounts: [2n],
        catalystTokenIds: [],
        catalystAmounts: [],
        outputTokenId: forgeDustTokenId,
        fee: 0n,
        maxTotalCrafts: 1_000n,
        maxCraftsPerWallet: 100n,
        outputSupplyCap: 1_000n
      },
      {
        recipeId: 2n,
        inputTokenIds: [fireShardTokenId, vaultSealTokenId, forgeDustTokenId],
        inputAmounts: [1n, 1n, 1n],
        catalystTokenIds: [],
        catalystAmounts: [],
        outputTokenId: signalBadgeTokenId,
        fee: ethers.parseEther("0.001"),
        maxTotalCrafts: 100n,
        maxCraftsPerWallet: 5n,
        outputSupplyCap: 100n
      },
      {
        recipeId: 3n,
        inputTokenIds: [signalBadgeTokenId],
        inputAmounts: [1n],
        catalystTokenIds: [physicalTokenId],
        catalystAmounts: [1n],
        outputTokenId: resonanceAuraTokenId,
        fee: ethers.parseEther("0.002"),
        maxTotalCrafts: 25n,
        maxCraftsPerWallet: 1n,
        outputSupplyCap: 25n
      },
      {
        recipeId: 4n,
        inputTokenIds: [signalBadgeTokenId],
        inputAmounts: [1n],
        catalystTokenIds: [resonanceAuraTokenId],
        catalystAmounts: [1n],
        outputTokenId: resonanceDustTokenId,
        fee: 0n,
        maxTotalCrafts: 250n,
        maxCraftsPerWallet: 5n,
        outputSupplyCap: 250n
      },
      {
        recipeId: 5n,
        inputTokenIds: [resonanceDustTokenId],
        inputAmounts: [1n],
        catalystTokenIds: [resonanceAuraTokenId, physicalTokenId],
        catalystAmounts: [1n, 1n],
        outputTokenId: curatorSigilTokenId,
        fee: ethers.parseEther("0.001"),
        maxTotalCrafts: 50n,
        maxCraftsPerWallet: 1n,
        outputSupplyCap: 50n
      }
    ];
    const nextRecipeId = await forge.nextRecipeId();
    if (nextRecipeId < BigInt(expectedForgeRecipes.length + 1)) {
      throw new Error("Forge seed recipes are missing");
    }
    for (const expectedRecipe of expectedForgeRecipes) {
      const recipe = await forge.recipes(expectedRecipe.recipeId);
      const [inputTokenIds, inputAmounts] = await forge.getRecipeInputs(expectedRecipe.recipeId);
      const [catalystTokenIds, catalystAmounts] = await forge.getRecipeCatalysts(expectedRecipe.recipeId);
      if (
        !recipe.exists
          || recipe.status !== 4n
          || recipe.outputTokenId !== expectedRecipe.outputTokenId
          || recipe.fee !== expectedRecipe.fee
          || recipe.maxTotalCrafts !== expectedRecipe.maxTotalCrafts
          || recipe.maxCraftsPerWallet !== expectedRecipe.maxCraftsPerWallet
          || recipe.outputSupplyCap !== expectedRecipe.outputSupplyCap
          || !arraysMatch(inputTokenIds, expectedRecipe.inputTokenIds)
          || !arraysMatch(inputAmounts, expectedRecipe.inputAmounts)
          || !arraysMatch(catalystTokenIds, expectedRecipe.catalystTokenIds)
          || !arraysMatch(catalystAmounts, expectedRecipe.catalystAmounts)
      ) {
        throw new Error(`Forge recipe ${expectedRecipe.recipeId} does not match the approved sample blueprint`);
      }
    }

    if ((await packSale.dropDustPolicyId(1n)) !== 1n) {
      throw new Error("PackSale drop 1 is missing Dust reward policy 1");
    }
    const dustPolicy = await dustRewardPolicy.getPolicy(1n);
    if (
      !dustPolicy.exists || !dustPolicy.active
        || dustPolicy.magicAmount !== expectedDustPolicy.magicAmount
        || dustPolicy.specialtyAmount !== expectedDustPolicy.specialtyAmount
        || dustPolicy.specialtyRolls !== expectedDustPolicy.specialtyRolls
        || dustPolicy.echoWeight !== expectedDustPolicy.echoWeight
        || dustPolicy.prismWeight !== expectedDustPolicy.prismWeight
        || dustPolicy.starWeight !== expectedDustPolicy.starWeight
    ) {
      throw new Error("Dust reward policy 1 does not match the reviewed testnet policy");
    }

    for (let recipeKind = 0; recipeKind < expectedVaultForgeRecipes.length; recipeKind++) {
      const expected = expectedVaultForgeRecipes[recipeKind]!;
      const actual = await vaultForge.getRecipeConfig(BigInt(recipeKind));
      if (
        actual.version === 0n || !actual.active
          || !arraysMatch(actual.dustAmounts, expected.dust)
          || actual.fee !== expected.fee
          || actual.maxTotalClaims !== expected.maxTotal
          || actual.maxClaimsPerWallet !== expected.maxWallet
          || actual.tradeInCount !== expected.tradeIns
          || actual.optionCount !== expected.options
      ) {
        throw new Error(`VaultForge recipe ${recipeKind} does not match the reviewed V4 configuration`);
      }
    }
    if (
      (await vaultForge.exchangeMagicCost()) !== 5n
        || (await vaultForge.exchangeInputAmount()) !== 3n
        || (await vaultForge.exchangeOutputAmount()) !== 1n
    ) {
      throw new Error("VaultForge Dust Exchange must be 3:1 plus 5 Magic Dust");
    }

    const collectiblePolicy = await collectibleForgePolicy.getTokenPolicy(physicalTokenId);
    if (
      !collectiblePolicy.exists
        || collectiblePolicy.canonicalKey !== ethers.id("pokemon:silver-tempest:lugia-v:186-195:alternate-art")
        || collectiblePolicy.setKey !== ethers.id("pokemon:silver-tempest")
        || collectiblePolicy.tier !== 4n
        || collectiblePolicy.tradeInEligible
        || !collectiblePolicy.tierPoolEligible
    ) {
      throw new Error("Seeded graded collectible policy does not match reviewed inventory metadata");
    }
  }

  await assertAddressEq("PackSale.inventoryRegistry", packSale.inventoryRegistry(), addresses.InventoryRegistry);
  await assertAddressEq("PackSale.itemToken", packSale.itemToken(), addresses.ItemToken);
  await assertAddressEq(
    "PackSale.randomnessProvider",
    packSale.randomnessProvider(),
    addresses.CommitRevealRandomnessProvider
  );
  await assertAddressEq("PackSale.treasury", packSale.treasury(), rolePlan.treasury);
  await assertAddressEq("PackSale.dustLedger", packSale.dustLedger(), addresses.DustLedger);
  await assertAddressEq("PackSale.dustRewardPolicy", packSale.dustRewardPolicy(), addresses.DustRewardPolicy);
  await assertAddressEq("Marketplace.itemToken", marketplace.itemToken(), addresses.ItemToken);
  await assertAddressEq("Marketplace.treasury", marketplace.treasury(), rolePlan.treasury);
  await assertAddressEq("BuybackVault.itemToken", buybackVault.itemToken(), addresses.ItemToken);
  await assertAddressEq("Forge.itemToken", forge.itemToken(), addresses.ItemToken);
  await assertAddressEq("Forge.inventoryRegistry", forge.inventoryRegistry(), addresses.InventoryRegistry);
  await assertAddressEq("Forge.treasury", forge.treasury(), rolePlan.treasury);
  await assertAddressEq("RedemptionRegistry.itemToken", redemptionRegistry.itemToken(), addresses.ItemToken);
  await assertAddressEq(
    "RedemptionRegistry.inventoryRegistry",
    redemptionRegistry.inventoryRegistry(),
    addresses.InventoryRegistry
  );
  await assertAddressEq(
    "CollectibleForgePolicy.inventoryRegistry",
    collectibleForgePolicy.inventoryRegistry(),
    addresses.InventoryRegistry
  );
  await assertAddressEq("TradeInVault.itemToken", tradeInVault.itemToken(), addresses.ItemToken);
  await assertAddressEq("TradeInVault.forge", tradeInVault.forge(), addresses.VaultForge);
  await assertAddressEq("TierPool.itemToken", tierPool.itemToken(), addresses.ItemToken);
  await assertAddressEq("TierPool.inventoryRegistry", tierPool.inventoryRegistry(), addresses.InventoryRegistry);
  await assertAddressEq(
    "TierPool.collectiblePolicy",
    tierPool.collectiblePolicy(),
    addresses.CollectibleForgePolicy
  );
  await assertAddressEq("TierPool.forge", tierPool.forge(), addresses.VaultForge);
  await assertAddressEq("VaultForge.itemToken", vaultForge.itemToken(), addresses.ItemToken);
  await assertAddressEq(
    "VaultForge.inventoryRegistry",
    vaultForge.inventoryRegistry(),
    addresses.InventoryRegistry
  );
  await assertAddressEq(
    "VaultForge.collectiblePolicy",
    vaultForge.collectiblePolicy(),
    addresses.CollectibleForgePolicy
  );
  await assertAddressEq("VaultForge.dustLedger", vaultForge.dustLedger(), addresses.DustLedger);
  await assertAddressEq("VaultForge.tradeInVault", vaultForge.tradeInVault(), addresses.TradeInVault);
  await assertAddressEq("VaultForge.tierPool", vaultForge.tierPool(), addresses.TierPool);
  await assertAddressEq("VaultForge.passport", vaultForge.passport(), addresses.VaultPassport);
  await assertAddressEq(
    "VaultForge.randomnessProvider",
    vaultForge.randomnessProvider(),
    addresses.CommitRevealRandomnessProvider
  );
  await assertAddressEq("VaultForge.treasury", vaultForge.treasury(), rolePlan.treasury);

  const defaultAdminContracts: Array<[string, RoleReadableContract]> = [
    ["InventoryRegistry", inventoryRegistry],
    ["ItemToken", itemToken],
    [randomnessPlan.label, randomnessProvider],
    ["PackSale", packSale],
    ["Marketplace", marketplace],
    ["BuybackVault", buybackVault],
    ["Forge", forge],
    ["RedemptionRegistry", redemptionRegistry],
    ["DustLedger", dustLedger],
    ["DustRewardPolicy", dustRewardPolicy],
    ["CollectibleForgePolicy", collectibleForgePolicy],
    ["TradeInVault", tradeInVault],
    ["TierPool", tierPool],
    ["VaultPassport", vaultPassport],
    ["VaultForge", vaultForge]
  ];
  for (const [label, contract] of defaultAdminContracts) {
    await assertDefaultAdmin(contract, rolePlan.protocolAdmin, label, deployer);
  }

  await assertRole(
    randomnessProvider,
    await randomnessProvider.REQUESTER_ROLE(),
    addresses.PackSale,
    `${randomnessPlan.label}.REQUESTER_ROLE for PackSale`
  );
  await assertRole(
    randomnessProvider,
    await randomnessProvider.REQUESTER_ROLE(),
    addresses.VaultForge,
    `${randomnessPlan.label}.REQUESTER_ROLE for VaultForge`
  );
  await assertRole(
    inventoryRegistry,
    await inventoryRegistry.TOKENIZER_ROLE(),
    addresses.PackSale,
    "InventoryRegistry.TOKENIZER_ROLE for PackSale"
  );
  await assertRole(
    inventoryRegistry,
    await inventoryRegistry.TOKENIZER_ROLE(),
    addresses.TierPool,
    "InventoryRegistry.TOKENIZER_ROLE for TierPool custody onboarding"
  );
  await assertRole(
    itemToken,
    await itemToken.MINTER_ROLE(),
    addresses.PackSale,
    "ItemToken.MINTER_ROLE for PackSale"
  );
  await assertRole(
    itemToken,
    await itemToken.MINTER_ROLE(),
    addresses.Forge,
    "ItemToken.MINTER_ROLE for Forge"
  );
  await assertRole(
    itemToken,
    await itemToken.MINTER_ROLE(),
    addresses.TierPool,
    "ItemToken.MINTER_ROLE for TierPool custody onboarding"
  );
  await assertRole(
    itemToken,
    await itemToken.BURNER_ROLE(),
    addresses.Forge,
    "ItemToken.BURNER_ROLE for Forge"
  );
  await assertRole(
    itemToken,
    await itemToken.BURNER_ROLE(),
    addresses.RedemptionRegistry,
    "ItemToken.BURNER_ROLE for RedemptionRegistry"
  );
  await assertRole(
    dustLedger,
    await dustLedger.CREDIT_ROLE(),
    addresses.PackSale,
    "DustLedger.CREDIT_ROLE for PackSale"
  );
  await assertRole(
    dustLedger,
    await dustLedger.CREDIT_ROLE(),
    addresses.VaultForge,
    "DustLedger.CREDIT_ROLE for VaultForge"
  );
  await assertRole(
    dustLedger,
    await dustLedger.SPENDER_ROLE(),
    addresses.VaultForge,
    "DustLedger.SPENDER_ROLE for VaultForge"
  );
  await assertRole(
    dustLedger,
    await dustLedger.RESTORER_ROLE(),
    addresses.VaultForge,
    "DustLedger.RESTORER_ROLE for VaultForge"
  );
  await assertRole(
    vaultPassport,
    await vaultPassport.FORGE_ROLE(),
    addresses.VaultForge,
    "VaultPassport.FORGE_ROLE for VaultForge"
  );

  const operationsRoles: Array<[RoleReadableContract, string, string]> = [
    [
      inventoryRegistry,
      await inventoryRegistry.INVENTORY_ADMIN_ROLE(),
      "InventoryRegistry.INVENTORY_ADMIN_ROLE"
    ],
    [itemToken, await itemToken.URI_SETTER_ROLE(), "ItemToken.URI_SETTER_ROLE"],
    [packSale, await packSale.DROP_ADMIN_ROLE(), "PackSale.DROP_ADMIN_ROLE"],
    [marketplace, await marketplace.MARKET_ADMIN_ROLE(), "Marketplace.MARKET_ADMIN_ROLE"],
    [buybackVault, await buybackVault.BUYBACK_ADMIN_ROLE(), "BuybackVault.BUYBACK_ADMIN_ROLE"],
    [forge, await forge.RECIPE_ADMIN_ROLE(), "Forge.RECIPE_ADMIN_ROLE"],
    [forge, await forge.CRAFT_REVIEWER_ROLE(), "Forge.CRAFT_REVIEWER_ROLE"],
    [
      redemptionRegistry,
      await redemptionRegistry.REDEMPTION_ADMIN_ROLE(),
      "RedemptionRegistry.REDEMPTION_ADMIN_ROLE"
    ],
    [dustRewardPolicy, await dustRewardPolicy.POLICY_ADMIN_ROLE(), "DustRewardPolicy.POLICY_ADMIN_ROLE"],
    [
      collectibleForgePolicy,
      await collectibleForgePolicy.POLICY_ADMIN_ROLE(),
      "CollectibleForgePolicy.POLICY_ADMIN_ROLE"
    ],
    [tradeInVault, await tradeInVault.CUSTODY_ADMIN_ROLE(), "TradeInVault.CUSTODY_ADMIN_ROLE"],
    [tierPool, await tierPool.POOL_ADMIN_ROLE(), "TierPool.POOL_ADMIN_ROLE"],
    [vaultForge, await vaultForge.RECIPE_ADMIN_ROLE(), "VaultForge.RECIPE_ADMIN_ROLE"]
  ];
  if (commitRevealRandomnessProvider !== undefined) {
    operationsRoles.push([
      commitRevealRandomnessProvider,
      await commitRevealRandomnessProvider.REVEALER_ROLE(),
      "CommitRevealRandomnessProvider.REVEALER_ROLE"
    ]);
  }
  if (coordinatorRandomnessProvider !== undefined) {
    operationsRoles.push([
      coordinatorRandomnessProvider,
      await coordinatorRandomnessProvider.FUND_ADMIN_ROLE(),
      "CoordinatorRandomnessProvider.FUND_ADMIN_ROLE"
    ]);
  }
  for (const [contract, role, label] of operationsRoles) {
    await assertHandoffRole(contract, role, rolePlan.operations, deployer, label);
  }

  const guardianRoles: Array<[RoleReadableContract, string, string]> = [
    [itemToken, await itemToken.PAUSER_ROLE(), "ItemToken.PAUSER_ROLE"],
    [packSale, await packSale.PAUSER_ROLE(), "PackSale.PAUSER_ROLE"],
    [marketplace, await marketplace.PAUSER_ROLE(), "Marketplace.PAUSER_ROLE"],
    [buybackVault, await buybackVault.PAUSER_ROLE(), "BuybackVault.PAUSER_ROLE"],
    [forge, await forge.PAUSER_ROLE(), "Forge.PAUSER_ROLE"],
    [
      redemptionRegistry,
      await redemptionRegistry.PAUSER_ROLE(),
      "RedemptionRegistry.PAUSER_ROLE"
    ],
    [dustLedger, await dustLedger.PAUSER_ROLE(), "DustLedger.PAUSER_ROLE"],
    [tierPool, await tierPool.PAUSER_ROLE(), "TierPool.PAUSER_ROLE"],
    [vaultForge, await vaultForge.PAUSER_ROLE(), "VaultForge.PAUSER_ROLE"]
  ];
  for (const [contract, role, label] of guardianRoles) {
    await assertHandoffRole(contract, role, rolePlan.guardian, deployer, label);
  }

  console.log(`smoke checks passed for ${network.name}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
