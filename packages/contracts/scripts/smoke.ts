import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";
import type { BaseContract } from "ethers";

type DeploymentFile = {
  contracts: Record<string, string>;
};

type AdminRoleContract = BaseContract & {
  DEFAULT_ADMIN_ROLE(): Promise<string>;
};

type MarketplaceContract = BaseContract & {
  feeBps(): Promise<bigint>;
};

type ForgeContract = BaseContract & {
  paused(): Promise<boolean>;
};

function deploymentsPath(networkName: string): string {
  return path.resolve(__dirname, "../../../deployments", `${networkName}.json`);
}

function loadDeployment(): DeploymentFile {
  const deploymentPath = deploymentsPath(network.name);
  if (!existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }

  return JSON.parse(readFileSync(deploymentPath, "utf8")) as DeploymentFile;
}

function requireAddress(deployment: DeploymentFile, name: string): string {
  const address = deployment.contracts[name];
  if (!address) {
    throw new Error(`Missing deployed address for ${name}`);
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

async function main(): Promise<void> {
  const deployment = loadDeployment();
  const requiredContracts = [
    "InventoryRegistry",
    "ItemToken",
    "CommitRevealRandomnessProvider",
    "PackSale",
    "Marketplace",
    "BuybackVault",
    "Forge",
    "RedemptionRegistry"
  ];

  for (const name of requiredContracts) {
    await assertBytecode(name, requireAddress(deployment, name));
  }

  const inventoryRegistry = (await ethers.getContractAt(
    "InventoryRegistry",
    requireAddress(deployment, "InventoryRegistry")
  )) as unknown as AdminRoleContract;
  const itemToken = (await ethers.getContractAt(
    "ItemToken",
    requireAddress(deployment, "ItemToken")
  )) as unknown as AdminRoleContract;
  const marketplace = (await ethers.getContractAt(
    "Marketplace",
    requireAddress(deployment, "Marketplace")
  )) as unknown as MarketplaceContract;
  const forge = (await ethers.getContractAt(
    "Forge",
    requireAddress(deployment, "Forge")
  )) as unknown as ForgeContract;

  await inventoryRegistry.DEFAULT_ADMIN_ROLE();
  await itemToken.DEFAULT_ADMIN_ROLE();
  await marketplace.feeBps();
  await forge.paused();

  console.log(`smoke checks passed for ${network.name}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
