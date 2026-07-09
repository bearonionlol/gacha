import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ethers, network } from "hardhat";
import type { BaseContract, ContractTransactionResponse } from "ethers";

type RoleContract = BaseContract & {
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
};

type InventoryRegistryContract = RoleContract & {
  INVENTORY_ADMIN_ROLE(): Promise<string>;
  TOKENIZER_ROLE(): Promise<string>;
};

type ItemTokenContract = RoleContract & {
  MINTER_ROLE(): Promise<string>;
  BURNER_ROLE(): Promise<string>;
  URI_SETTER_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
};

type RandomnessProviderContract = RoleContract & {
  REQUESTER_ROLE(): Promise<string>;
  REVEALER_ROLE(): Promise<string>;
};

type PackSaleContract = RoleContract & {
  DROP_ADMIN_ROLE(): Promise<string>;
};

type MarketplaceContract = RoleContract & {
  MARKET_ADMIN_ROLE(): Promise<string>;
};

type BuybackVaultContract = RoleContract & {
  BUYBACK_ADMIN_ROLE(): Promise<string>;
};

type ForgeContract = RoleContract & {
  RECIPE_ADMIN_ROLE(): Promise<string>;
  CRAFT_REVIEWER_ROLE(): Promise<string>;
};

type RedemptionRegistryContract = RoleContract & {
  REDEMPTION_ADMIN_ROLE(): Promise<string>;
};

type DeploymentAddresses = {
  InventoryRegistry: string;
  ItemToken: string;
  CommitRevealRandomnessProvider: string;
  PackSale: string;
  Marketplace: string;
  BuybackVault: string;
  Forge: string;
  RedemptionRegistry: string;
};

async function deployContract<TContract extends BaseContract>(
  name: string,
  args: unknown[] = []
): Promise<TContract> {
  const contract = (await ethers.deployContract(name, args)) as unknown as TContract;
  await contract.waitForDeployment();
  console.log(`${name}: ${await contract.getAddress()}`);

  return contract;
}

async function grantRole(
  contract: RoleContract,
  role: string,
  account: string,
  label: string
): Promise<void> {
  const tx = await contract.grantRole(role, account);
  await tx.wait();
  console.log(`granted ${label} to ${account}`);
}

function deploymentsPath(networkName: string): string {
  return path.resolve(__dirname, "../../../deployments", `${networkName}.json`);
}

function assertMainnetRandomnessAllowed(): void {
  if (network.name !== "robinhoodMainnet") {
    return;
  }

  if (process.env.ALLOW_OPERATOR_RANDOMNESS_MAINNET === "true") {
    console.warn(
      "ALLOW_OPERATOR_RANDOMNESS_MAINNET=true: deploying testnet/demo CommitRevealRandomnessProvider on mainnet"
    );
    return;
  }

  throw new Error(
    "Mainnet deploy blocked: the default CommitRevealRandomnessProvider is testnet/demo only. Mainnet requires approved fair/verifiable randomness, or set ALLOW_OPERATOR_RANDOMNESS_MAINNET=true only for an explicitly controlled unsafe rehearsal."
  );
}

async function main(): Promise<void> {
  assertMainnetRandomnessAllowed();

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer is configured");
  }

  const deployerAddress = await deployer.getAddress();
  const chain = await ethers.provider.getNetwork();
  console.log(`deploying to ${network.name} (${chain.chainId}) from ${deployerAddress}`);

  const inventoryRegistry = await deployContract<InventoryRegistryContract>("InventoryRegistry");
  const itemToken = await deployContract<ItemTokenContract>("ItemToken");
  const randomnessProvider = await deployContract<RandomnessProviderContract>(
    "CommitRevealRandomnessProvider"
  );
  const packSale = await deployContract<PackSaleContract>("PackSale", [
    await inventoryRegistry.getAddress(),
    await itemToken.getAddress(),
    await randomnessProvider.getAddress(),
    deployerAddress
  ]);
  const marketplace = await deployContract<MarketplaceContract>("Marketplace", [
    await itemToken.getAddress(),
    deployerAddress
  ]);
  const buybackVault = await deployContract<BuybackVaultContract>("BuybackVault", [
    await itemToken.getAddress()
  ]);
  const forge = await deployContract<ForgeContract>("Forge", [
    await itemToken.getAddress(),
    await inventoryRegistry.getAddress(),
    deployerAddress
  ]);
  const redemptionRegistry = await deployContract<RedemptionRegistryContract>(
    "RedemptionRegistry",
    [await itemToken.getAddress(), await inventoryRegistry.getAddress()]
  );

  await grantRole(
    itemToken,
    await itemToken.MINTER_ROLE(),
    await packSale.getAddress(),
    "ItemToken.MINTER_ROLE for PackSale"
  );
  await grantRole(
    itemToken,
    await itemToken.MINTER_ROLE(),
    await forge.getAddress(),
    "ItemToken.MINTER_ROLE for Forge"
  );
  await grantRole(
    itemToken,
    await itemToken.BURNER_ROLE(),
    await forge.getAddress(),
    "ItemToken.BURNER_ROLE for Forge"
  );
  await grantRole(
    itemToken,
    await itemToken.BURNER_ROLE(),
    await redemptionRegistry.getAddress(),
    "ItemToken.BURNER_ROLE for RedemptionRegistry"
  );
  await grantRole(
    inventoryRegistry,
    await inventoryRegistry.TOKENIZER_ROLE(),
    await packSale.getAddress(),
    "InventoryRegistry.TOKENIZER_ROLE for PackSale"
  );
  await grantRole(
    randomnessProvider,
    await randomnessProvider.REQUESTER_ROLE(),
    await packSale.getAddress(),
    "CommitRevealRandomnessProvider.REQUESTER_ROLE for PackSale"
  );

  await grantRole(
    inventoryRegistry,
    await inventoryRegistry.INVENTORY_ADMIN_ROLE(),
    deployerAddress,
    "InventoryRegistry.INVENTORY_ADMIN_ROLE for deployer"
  );
  await grantRole(
    itemToken,
    await itemToken.URI_SETTER_ROLE(),
    deployerAddress,
    "ItemToken.URI_SETTER_ROLE for deployer"
  );
  await grantRole(
    itemToken,
    await itemToken.PAUSER_ROLE(),
    deployerAddress,
    "ItemToken.PAUSER_ROLE for deployer"
  );
  await grantRole(
    randomnessProvider,
    await randomnessProvider.REVEALER_ROLE(),
    deployerAddress,
    "CommitRevealRandomnessProvider.REVEALER_ROLE for deployer"
  );
  await grantRole(
    packSale,
    await packSale.DROP_ADMIN_ROLE(),
    deployerAddress,
    "PackSale.DROP_ADMIN_ROLE for deployer"
  );
  await grantRole(
    marketplace,
    await marketplace.MARKET_ADMIN_ROLE(),
    deployerAddress,
    "Marketplace.MARKET_ADMIN_ROLE for deployer"
  );
  await grantRole(
    buybackVault,
    await buybackVault.BUYBACK_ADMIN_ROLE(),
    deployerAddress,
    "BuybackVault.BUYBACK_ADMIN_ROLE for deployer"
  );
  await grantRole(
    forge,
    await forge.RECIPE_ADMIN_ROLE(),
    deployerAddress,
    "Forge.RECIPE_ADMIN_ROLE for deployer"
  );
  await grantRole(
    forge,
    await forge.CRAFT_REVIEWER_ROLE(),
    deployerAddress,
    "Forge.CRAFT_REVIEWER_ROLE for deployer"
  );
  await grantRole(
    redemptionRegistry,
    await redemptionRegistry.REDEMPTION_ADMIN_ROLE(),
    deployerAddress,
    "RedemptionRegistry.REDEMPTION_ADMIN_ROLE for deployer"
  );

  const addresses: DeploymentAddresses = {
    InventoryRegistry: await inventoryRegistry.getAddress(),
    ItemToken: await itemToken.getAddress(),
    CommitRevealRandomnessProvider: await randomnessProvider.getAddress(),
    PackSale: await packSale.getAddress(),
    Marketplace: await marketplace.getAddress(),
    BuybackVault: await buybackVault.getAddress(),
    Forge: await forge.getAddress(),
    RedemptionRegistry: await redemptionRegistry.getAddress()
  };

  const deployment = {
    network: network.name,
    chainId: Number(chain.chainId),
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    contracts: addresses
  };
  const outputPath = deploymentsPath(network.name);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
