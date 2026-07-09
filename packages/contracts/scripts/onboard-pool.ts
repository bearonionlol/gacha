import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";
import type { BaseContract, ContractTransactionResponse } from "ethers";

type DeploymentFile = {
  chainId: number;
  contracts: {
    InventoryRegistry: string;
    ItemToken: string;
    CollectibleForgePolicy: string;
    TierPool: string;
  };
};

type ManifestEntry = {
  inventoryId: string;
  setFocused: boolean;
};

type InventoryRecord = {
  tokenId: bigint;
  redeemable: boolean;
  tokenized: boolean;
  owner: string;
};

type InventoryRegistryContract = BaseContract & {
  getInventory(inventoryId: string): Promise<InventoryRecord>;
};

type TokenPolicy = {
  setKey: string;
  tier: bigint;
  tierPoolEligible: boolean;
  exists: boolean;
};

type CollectibleForgePolicyContract = BaseContract & {
  getTokenPolicy(tokenId: bigint): Promise<TokenPolicy>;
};

type ItemTokenContract = BaseContract & {
  balanceOf(account: string, tokenId: bigint): Promise<bigint>;
};

type TierPoolContract = BaseContract & {
  poolKeyFor(tier: bigint, setKey: string): Promise<string>;
  tokenPoolKey(tokenId: bigint): Promise<string>;
  onboardInventory(inventoryId: string, setFocused: boolean): Promise<ContractTransactionResponse>;
};

function requireAddress(value: string | undefined, label: string): string {
  if (!value || !ethers.isAddress(value)) throw new Error(`Invalid ${label} address in deployment registry`);
  return value;
}

function loadDeployment(): DeploymentFile {
  const deploymentPath = path.resolve(__dirname, "../../../deployments", `${network.name}.json`);
  if (!existsSync(deploymentPath)) throw new Error(`Missing deployment file: ${deploymentPath}`);
  return JSON.parse(readFileSync(deploymentPath, "utf8")) as DeploymentFile;
}

function loadManifest(): ManifestEntry[] {
  const configuredPath = process.env.TIER_POOL_MANIFEST_PATH;
  if (!configuredPath) throw new Error("TIER_POOL_MANIFEST_PATH is required");
  const manifestPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, "../../..", configuredPath);
  if (!existsSync(manifestPath)) throw new Error(`Missing TierPool manifest: ${manifestPath}`);
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("TierPool manifest must be a non-empty array");

  const inventoryIds = new Set<string>();
  return parsed.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") throw new Error(`Invalid manifest entry ${index}`);
    const record = candidate as Record<string, unknown>;
    if (typeof record.inventoryId !== "string" || record.inventoryId.trim().length === 0) {
      throw new Error(`Manifest entry ${index} requires inventoryId`);
    }
    if (typeof record.setFocused !== "boolean") throw new Error(`Manifest entry ${index} requires setFocused`);
    if (inventoryIds.has(record.inventoryId)) throw new Error(`Duplicate manifest inventoryId: ${record.inventoryId}`);
    inventoryIds.add(record.inventoryId);
    return { inventoryId: record.inventoryId, setFocused: record.setFocused };
  });
}

async function main(): Promise<void> {
  if (network.name === "robinhoodMainnet" && process.env.ALLOW_POOL_ONBOARDING_MAINNET !== "true") {
    throw new Error("Mainnet pool onboarding is blocked without ALLOW_POOL_ONBOARDING_MAINNET=true");
  }

  const deployment = loadDeployment();
  const chain = await ethers.provider.getNetwork();
  if (deployment.chainId !== Number(chain.chainId)) {
    throw new Error(`Deployment chain ${deployment.chainId} does not match provider chain ${chain.chainId}`);
  }

  const inventoryRegistry = (await ethers.getContractAt(
    "InventoryRegistry",
    requireAddress(deployment.contracts.InventoryRegistry, "InventoryRegistry")
  )) as unknown as InventoryRegistryContract;
  const itemToken = (await ethers.getContractAt(
    "ItemToken",
    requireAddress(deployment.contracts.ItemToken, "ItemToken")
  )) as unknown as ItemTokenContract;
  const collectiblePolicy = (await ethers.getContractAt(
    "CollectibleForgePolicy",
    requireAddress(deployment.contracts.CollectibleForgePolicy, "CollectibleForgePolicy")
  )) as unknown as CollectibleForgePolicyContract;
  const tierPool = (await ethers.getContractAt(
    "TierPool",
    requireAddress(deployment.contracts.TierPool, "TierPool")
  )) as unknown as TierPoolContract;
  const tierPoolAddress = await tierPool.getAddress();

  for (const entry of loadManifest()) {
    const inventory = await inventoryRegistry.getInventory(entry.inventoryId);
    if (!inventory.redeemable) throw new Error(`${entry.inventoryId} is not redeemable`);
    const policy = await collectiblePolicy.getTokenPolicy(inventory.tokenId);
    if (!policy.exists || !policy.tierPoolEligible) {
      throw new Error(`${entry.inventoryId} is not eligible for TierPool custody`);
    }
    const expectedPoolKey = await tierPool.poolKeyFor(
      policy.tier,
      entry.setFocused ? policy.setKey : ethers.ZeroHash
    );
    const currentPoolKey = await tierPool.tokenPoolKey(inventory.tokenId);
    if (currentPoolKey !== ethers.ZeroHash) {
      if (currentPoolKey !== expectedPoolKey) {
        throw new Error(`${entry.inventoryId} is already in a different TierPool`);
      }
      if ((await itemToken.balanceOf(tierPoolAddress, inventory.tokenId)) !== 1n) {
        throw new Error(`${entry.inventoryId} has a pool record without custody balance`);
      }
      console.log(`already onboarded: ${entry.inventoryId}`);
      continue;
    }
    if (inventory.tokenized) {
      throw new Error(`${entry.inventoryId} was tokenized to ${inventory.owner} but is not in TierPool custody`);
    }

    const transaction = await tierPool.onboardInventory(entry.inventoryId, entry.setFocused);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`TierPool onboarding reverted: ${entry.inventoryId}`);

    const finalPoolKey = await tierPool.tokenPoolKey(inventory.tokenId);
    const finalBalance = await itemToken.balanceOf(tierPoolAddress, inventory.tokenId);
    if (finalPoolKey !== expectedPoolKey || finalBalance !== 1n) {
      throw new Error(`TierPool custody verification failed: ${entry.inventoryId}`);
    }
    console.log(`onboarded ${entry.inventoryId}: ${transaction.hash}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
