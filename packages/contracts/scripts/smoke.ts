import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";
import type { BaseContract } from "ethers";

type DeploymentFile = {
  chainId: number;
  deployer: string;
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
};

type RandomnessProviderContract = RoleReadableContract & {
  REQUESTER_ROLE(): Promise<string>;
  REVEALER_ROLE(): Promise<string>;
  readRandomness(requestId: string): Promise<[boolean, bigint]>;
};

type PackSaleContract = RoleReadableContract & {
  DROP_ADMIN_ROLE(): Promise<string>;
  REFUND_TIMEOUT(): Promise<bigint>;
  inventoryRegistry(): Promise<string>;
  itemToken(): Promise<string>;
  randomnessProvider(): Promise<string>;
  treasury(): Promise<string>;
  nextDropId(): Promise<bigint>;
  getDropBonus(dropId: bigint): Promise<[bigint[], bigint[], string[]]>;
};

type MarketplaceContract = RoleReadableContract & {
  MARKET_ADMIN_ROLE(): Promise<string>;
  itemToken(): Promise<string>;
  treasury(): Promise<string>;
  feeBps(): Promise<bigint>;
  nextListingId(): Promise<bigint>;
};

type BuybackVaultContract = RoleReadableContract & {
  BUYBACK_ADMIN_ROLE(): Promise<string>;
  itemToken(): Promise<string>;
  totalPayoutCredit(): Promise<bigint>;
  quotes(tokenId: bigint): Promise<readonly [bigint, boolean] & { price: bigint; active: boolean }>;
};

type ForgeRecipeView = {
  status: bigint;
  outputTokenId: bigint;
  outputSupplyCap: bigint;
  exists: boolean;
};

type ForgeContract = RoleReadableContract & {
  RECIPE_ADMIN_ROLE(): Promise<string>;
  CRAFT_REVIEWER_ROLE(): Promise<string>;
  itemToken(): Promise<string>;
  inventoryRegistry(): Promise<string>;
  treasury(): Promise<string>;
  paused(): Promise<boolean>;
  nextRecipeId(): Promise<bigint>;
  recipes(recipeId: bigint): Promise<ForgeRecipeView>;
  getRecipeCatalysts(recipeId: bigint): Promise<[bigint[], bigint[]]>;
};

type RedemptionRegistryContract = RoleReadableContract & {
  REDEMPTION_ADMIN_ROLE(): Promise<string>;
  itemToken(): Promise<string>;
  inventoryRegistry(): Promise<string>;
  nextRequestId(): Promise<bigint>;
};

const contractNames = [
  "InventoryRegistry",
  "ItemToken",
  "CommitRevealRandomnessProvider",
  "PackSale",
  "Marketplace",
  "BuybackVault",
  "Forge",
  "RedemptionRegistry"
] as const;

const sampleDropInventoryId = "inv-sample-graded-001";
const expectedMarketplaceFeeBps = 250n;
const expectedBuybackQuote = ethers.parseEther("0.004");
const expectedStarterTokenIds = [7_001n, 7_002n] as const;
const expectedStarterAmounts = [3n, 1n] as const;

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

async function assertDefaultAdmin(
  contract: RoleReadableContract,
  deployer: string,
  label: string
): Promise<void> {
  await assertRole(contract, await contract.DEFAULT_ADMIN_ROLE(), deployer, `${label}.DEFAULT_ADMIN_ROLE`);
}

async function main(): Promise<void> {
  const deployment = loadDeployment();
  const chain = await ethers.provider.getNetwork();
  if (deployment.chainId !== Number(chain.chainId)) {
    throw new Error(
      `Deployment file chainId ${deployment.chainId} does not match provider chainId ${chain.chainId}`
    );
  }

  const deployer = deployment.deployer;
  const addresses = Object.fromEntries(
    contractNames.map((name) => [name, requireAddress(deployment, name)])
  ) as Record<(typeof contractNames)[number], string>;

  for (const name of contractNames) {
    await assertBytecode(name, addresses[name]);
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
    "CommitRevealRandomnessProvider",
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

  await inventoryRegistry.DEFAULT_ADMIN_ROLE();
  await itemToken.DEFAULT_ADMIN_ROLE();
  await marketplace.feeBps();
  await forge.paused();

  await randomnessProvider.REQUESTER_ROLE();
  await randomnessProvider.REVEALER_ROLE();
  await randomnessProvider.readRandomness(ethers.ZeroHash);
  await packSale.REFUND_TIMEOUT();
  await packSale.nextDropId();
  await marketplace.nextListingId();
  await buybackVault.totalPayoutCredit();
  await forge.nextRecipeId();
  await redemptionRegistry.nextRequestId();

  const expectsSampleSeed = network.name === "localhost" || network.name === "robinhoodTestnet";
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

    const nextRecipeId = await forge.nextRecipeId();
    if (nextRecipeId < 4n) {
      throw new Error("Forge seed recipes are missing");
    }
    for (const recipeId of [1n, 2n, 3n]) {
      const recipe = await forge.recipes(recipeId);
      if (!recipe.exists || recipe.status !== 4n || recipe.outputSupplyCap === 0n) {
        throw new Error(`Forge recipe ${recipeId} is not active and supply-capped`);
      }
    }
    const [catalystTokenIds, catalystAmounts] = await forge.getRecipeCatalysts(3n);
    if (
      catalystTokenIds.length !== 1 || catalystTokenIds[0] !== physicalTokenId
        || catalystAmounts.length !== 1 || catalystAmounts[0] !== 1n
    ) {
      throw new Error("Forge resonance recipe does not retain the seeded physical catalyst");
    }
  }

  await assertAddressEq("PackSale.inventoryRegistry", packSale.inventoryRegistry(), addresses.InventoryRegistry);
  await assertAddressEq("PackSale.itemToken", packSale.itemToken(), addresses.ItemToken);
  await assertAddressEq(
    "PackSale.randomnessProvider",
    packSale.randomnessProvider(),
    addresses.CommitRevealRandomnessProvider
  );
  await assertAddressEq("PackSale.treasury", packSale.treasury(), deployer);
  await assertAddressEq("Marketplace.itemToken", marketplace.itemToken(), addresses.ItemToken);
  await assertAddressEq("Marketplace.treasury", marketplace.treasury(), deployer);
  await assertAddressEq("BuybackVault.itemToken", buybackVault.itemToken(), addresses.ItemToken);
  await assertAddressEq("Forge.itemToken", forge.itemToken(), addresses.ItemToken);
  await assertAddressEq("Forge.inventoryRegistry", forge.inventoryRegistry(), addresses.InventoryRegistry);
  await assertAddressEq("Forge.treasury", forge.treasury(), deployer);
  await assertAddressEq("RedemptionRegistry.itemToken", redemptionRegistry.itemToken(), addresses.ItemToken);
  await assertAddressEq(
    "RedemptionRegistry.inventoryRegistry",
    redemptionRegistry.inventoryRegistry(),
    addresses.InventoryRegistry
  );

  await assertDefaultAdmin(inventoryRegistry, deployer, "InventoryRegistry");
  await assertDefaultAdmin(itemToken, deployer, "ItemToken");
  await assertDefaultAdmin(randomnessProvider, deployer, "CommitRevealRandomnessProvider");
  await assertDefaultAdmin(packSale, deployer, "PackSale");
  await assertDefaultAdmin(marketplace, deployer, "Marketplace");
  await assertDefaultAdmin(buybackVault, deployer, "BuybackVault");
  await assertDefaultAdmin(forge, deployer, "Forge");
  await assertDefaultAdmin(redemptionRegistry, deployer, "RedemptionRegistry");

  await assertRole(
    randomnessProvider,
    await randomnessProvider.REQUESTER_ROLE(),
    addresses.PackSale,
    "CommitRevealRandomnessProvider.REQUESTER_ROLE for PackSale"
  );
  await assertRole(
    inventoryRegistry,
    await inventoryRegistry.TOKENIZER_ROLE(),
    addresses.PackSale,
    "InventoryRegistry.TOKENIZER_ROLE for PackSale"
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
    inventoryRegistry,
    await inventoryRegistry.INVENTORY_ADMIN_ROLE(),
    deployer,
    "InventoryRegistry.INVENTORY_ADMIN_ROLE for deployer"
  );
  await assertRole(itemToken, await itemToken.URI_SETTER_ROLE(), deployer, "ItemToken.URI_SETTER_ROLE for deployer");
  await assertRole(itemToken, await itemToken.PAUSER_ROLE(), deployer, "ItemToken.PAUSER_ROLE for deployer");
  await assertRole(
    randomnessProvider,
    await randomnessProvider.REVEALER_ROLE(),
    deployer,
    "CommitRevealRandomnessProvider.REVEALER_ROLE for deployer"
  );
  await assertRole(packSale, await packSale.DROP_ADMIN_ROLE(), deployer, "PackSale.DROP_ADMIN_ROLE for deployer");
  await assertRole(
    marketplace,
    await marketplace.MARKET_ADMIN_ROLE(),
    deployer,
    "Marketplace.MARKET_ADMIN_ROLE for deployer"
  );
  await assertRole(
    buybackVault,
    await buybackVault.BUYBACK_ADMIN_ROLE(),
    deployer,
    "BuybackVault.BUYBACK_ADMIN_ROLE for deployer"
  );
  await assertRole(forge, await forge.RECIPE_ADMIN_ROLE(), deployer, "Forge.RECIPE_ADMIN_ROLE for deployer");
  await assertRole(
    forge,
    await forge.CRAFT_REVIEWER_ROLE(),
    deployer,
    "Forge.CRAFT_REVIEWER_ROLE for deployer"
  );
  await assertRole(
    redemptionRegistry,
    await redemptionRegistry.REDEMPTION_ADMIN_ROLE(),
    deployer,
    "RedemptionRegistry.REDEMPTION_ADMIN_ROLE for deployer"
  );

  console.log(`smoke checks passed for ${network.name}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
