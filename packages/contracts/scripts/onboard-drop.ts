import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";
import type { BaseContract, ContractTransactionResponse } from "ethers";
import { parseReviewedDropManifest, singleBuyerAllowlistRoot } from "./drop-onboarding-config";

type DeploymentFile = {
  chainId: number;
  contracts: {
    CollectibleForgePolicy: string;
    DustRewardPolicy: string;
    InventoryRegistry: string;
    PackSale: string;
  };
};

type InventoryRecord = {
  inventoryHash: string;
  metadataUri: string;
  redeemable: boolean;
  grailProtected: boolean;
  tokenId: bigint;
  tokenized: boolean;
  owner: string;
};

type InventoryRegistryContract = BaseContract & {
  INVENTORY_ADMIN_ROLE(): Promise<string>;
  hasRole(role: string, account: string): Promise<boolean>;
  derivePhysicalTokenId(inventoryId: string): Promise<bigint>;
  getInventory(inventoryId: string): Promise<InventoryRecord>;
  anchorInventory(
    inventoryId: string,
    inventoryHash: string,
    metadataUri: string,
    redeemable: boolean,
    grailProtected: boolean
  ): Promise<ContractTransactionResponse>;
};

type TokenPolicy = {
  canonicalKey: string;
  setKey: string;
  tier: bigint;
  tradeInEligible: boolean;
  tierPoolEligible: boolean;
  exists: boolean;
};

type CollectibleForgePolicyContract = BaseContract & {
  POLICY_ADMIN_ROLE(): Promise<string>;
  hasRole(role: string, account: string): Promise<boolean>;
  hasPolicy(tokenId: bigint): Promise<boolean>;
  getTokenPolicy(tokenId: bigint): Promise<TokenPolicy>;
  setTokenPolicy(
    tokenId: bigint,
    canonicalKey: string,
    setKey: string,
    tier: number,
    tradeInEligible: boolean,
    tierPoolEligible: boolean
  ): Promise<ContractTransactionResponse>;
};

type DropSummary = {
  name: string;
  price: bigint;
  startTime: bigint;
  endTime: bigint;
  maxSupply: bigint;
  maxPerWallet: bigint;
  allowlistRoot: string;
  sold: bigint;
  pendingPurchases: bigint;
  remainingInventory: bigint;
};

type PackSaleContract = BaseContract & {
  DROP_ADMIN_ROLE(): Promise<string>;
  hasRole(role: string, account: string): Promise<boolean>;
  nextDropId(): Promise<bigint>;
  createDrop(params: {
    name: string;
    price: bigint;
    startTime: bigint;
    endTime: bigint;
    maxSupply: bigint;
    maxPerWallet: bigint;
    allowlistRoot: string;
    inventoryIds: string[];
    metadataUris: string[];
    bonusTokenIds: bigint[];
    bonusAmounts: bigint[];
    bonusUris: string[];
  }): Promise<ContractTransactionResponse>;
  dropDustPolicyId(dropId: bigint): Promise<bigint>;
  setDropDustPolicy(dropId: bigint, policyId: bigint): Promise<ContractTransactionResponse>;
  getDropSummary(dropId: bigint): Promise<DropSummary>;
  getDropBonus(dropId: bigint): Promise<[bigint[], bigint[], string[]]>;
};

type DustRewardPolicyContract = BaseContract & {
  getPolicy(policyId: bigint): Promise<{ active: boolean; exists: boolean }>;
};

function requireAddress(value: string | undefined, label: string): string {
  if (!value || !ethers.isAddress(value)) throw new Error(`Invalid ${label} address in deployment registry`);
  return ethers.getAddress(value);
}

function loadDeployment(): DeploymentFile {
  const deploymentPath = path.resolve(__dirname, "../../../deployments", `${network.name}.json`);
  if (!existsSync(deploymentPath)) throw new Error(`Missing deployment file: ${deploymentPath}`);
  return JSON.parse(readFileSync(deploymentPath, "utf8")) as DeploymentFile;
}

function loadManifest() {
  const configuredPath = process.env.TESTNET_DROP_MANIFEST_PATH;
  if (!configuredPath) throw new Error("TESTNET_DROP_MANIFEST_PATH is required");
  const manifestPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, "../../..", configuredPath);
  if (!existsSync(manifestPath)) throw new Error(`Missing reviewed drop manifest: ${manifestPath}`);
  return parseReviewedDropManifest(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);
}

async function submit(label: string, request: Promise<ContractTransactionResponse>): Promise<string> {
  const transaction = await request;
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`${label} reverted`);
  console.log(`${label}: ${transaction.hash}`);
  return transaction.hash;
}

async function requireRole(
  contract: { hasRole(role: string, account: string): Promise<boolean> },
  role: string,
  account: string,
  label: string
): Promise<void> {
  if (!(await contract.hasRole(role, account))) throw new Error(`${account} is missing ${label}`);
}

async function maybeInventory(
  inventoryRegistry: InventoryRegistryContract,
  inventoryId: string
): Promise<InventoryRecord | null> {
  try {
    return await inventoryRegistry.getInventory(inventoryId);
  } catch (error: unknown) {
    const data = extractErrorData(error);
    if (data) {
      try {
        if (inventoryRegistry.interface.parseError(data)?.name === "InventoryNotAnchored") return null;
      } catch {}
    }
    throw error;
  }
}

function extractErrorData(error: unknown, seen = new Set<unknown>()): string | undefined {
  if (!error || typeof error !== "object" || seen.has(error)) return undefined;
  seen.add(error);
  const record = error as Record<string, unknown>;
  if (typeof record.data === "string" && record.data.startsWith("0x")) return record.data;
  for (const key of ["error", "info", "receipt"] as const) {
    const nested = extractErrorData(record[key], seen);
    if (nested) return nested;
  }
  return undefined;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label} expected ${String(expected)} got ${String(actual)}`);
}

async function main(): Promise<void> {
  if (network.name !== "robinhoodTestnet") {
    throw new Error("Reviewed single-item drop onboarding is restricted to robinhoodTestnet");
  }

  const manifest = loadManifest();
  const deployment = loadDeployment();
  const chain = await ethers.provider.getNetwork();
  if (deployment.chainId !== Number(chain.chainId) || chain.chainId !== 46_630n) {
    throw new Error(`Expected Robinhood testnet chain 46630, received ${chain.chainId}`);
  }
  const [operator] = await ethers.getSigners();
  if (!operator) throw new Error("No testnet operator signer is configured");
  const operatorAddress = await operator.getAddress();

  const inventoryRegistry = (await ethers.getContractAt(
    "InventoryRegistry",
    requireAddress(deployment.contracts.InventoryRegistry, "InventoryRegistry")
  )) as unknown as InventoryRegistryContract;
  const collectiblePolicy = (await ethers.getContractAt(
    "CollectibleForgePolicy",
    requireAddress(deployment.contracts.CollectibleForgePolicy, "CollectibleForgePolicy")
  )) as unknown as CollectibleForgePolicyContract;
  const packSale = (await ethers.getContractAt(
    "PackSale",
    requireAddress(deployment.contracts.PackSale, "PackSale")
  )) as unknown as PackSaleContract;
  const dustRewardPolicy = (await ethers.getContractAt(
    "DustRewardPolicy",
    requireAddress(deployment.contracts.DustRewardPolicy, "DustRewardPolicy")
  )) as unknown as DustRewardPolicyContract;

  await requireRole(
    inventoryRegistry,
    await inventoryRegistry.INVENTORY_ADMIN_ROLE(),
    operatorAddress,
    "InventoryRegistry.INVENTORY_ADMIN_ROLE"
  );
  await requireRole(
    collectiblePolicy,
    await collectiblePolicy.POLICY_ADMIN_ROLE(),
    operatorAddress,
    "CollectibleForgePolicy.POLICY_ADMIN_ROLE"
  );
  await requireRole(packSale, await packSale.DROP_ADMIN_ROLE(), operatorAddress, "PackSale.DROP_ADMIN_ROLE");

  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) throw new Error("Unable to read latest Robinhood testnet block");
  const now = BigInt(latestBlock.timestamp);
  if (manifest.drop.startTime > now || manifest.drop.endTime <= now) {
    throw new Error("Reviewed drop manifest is not active at the latest testnet block timestamp");
  }
  if (manifest.inventory.policy.tradeInEligible || manifest.inventory.policy.tierPoolEligible) {
    throw new Error("The first controlled real-item drop must remain excluded from trade-in and TierPool custody");
  }

  let inventory = await maybeInventory(inventoryRegistry, manifest.inventory.inventoryId);
  if (!inventory) {
    await submit(
      "anchor reviewed inventory",
      inventoryRegistry.anchorInventory(
        manifest.inventory.inventoryId,
        manifest.inventory.inventoryHash,
        manifest.inventory.metadataUri,
        manifest.inventory.redeemable,
        manifest.inventory.grailProtected
      )
    );
    inventory = await inventoryRegistry.getInventory(manifest.inventory.inventoryId);
  }
  const tokenId = await inventoryRegistry.derivePhysicalTokenId(manifest.inventory.inventoryId);
  assertEqual(inventory.inventoryHash.toLowerCase(), manifest.inventory.inventoryHash.toLowerCase(), "inventoryHash");
  assertEqual(inventory.metadataUri, manifest.inventory.metadataUri, "metadataUri");
  assertEqual(inventory.redeemable, manifest.inventory.redeemable, "redeemable");
  assertEqual(inventory.grailProtected, manifest.inventory.grailProtected, "grailProtected");
  assertEqual(inventory.tokenId, tokenId, "physical token ID");
  if (inventory.tokenized || inventory.owner !== ethers.ZeroAddress) {
    throw new Error("Reviewed inventory is already tokenized and cannot be published in a new drop");
  }

  const expectedCanonicalKey = ethers.id(manifest.inventory.policy.canonicalKey);
  const expectedSetKey = ethers.id(manifest.inventory.policy.setKey);
  if (!(await collectiblePolicy.hasPolicy(tokenId))) {
    await submit(
      "set reviewed Forge policy",
      collectiblePolicy.setTokenPolicy(
        tokenId,
        expectedCanonicalKey,
        expectedSetKey,
        manifest.inventory.policy.tier,
        false,
        false
      )
    );
  }
  const policy = await collectiblePolicy.getTokenPolicy(tokenId);
  assertEqual(policy.canonicalKey.toLowerCase(), expectedCanonicalKey.toLowerCase(), "canonical policy key");
  assertEqual(policy.setKey.toLowerCase(), expectedSetKey.toLowerCase(), "set policy key");
  assertEqual(policy.tier, BigInt(manifest.inventory.policy.tier), "Forge tier");
  assertEqual(policy.tradeInEligible, false, "trade-in eligibility");
  assertEqual(policy.tierPoolEligible, false, "TierPool eligibility");

  const dustPolicy = await dustRewardPolicy.getPolicy(manifest.drop.dustPolicyId);
  if (!dustPolicy.exists || !dustPolicy.active) throw new Error("Reviewed drop Dust policy is missing or inactive");

  const allowlistRoot = singleBuyerAllowlistRoot(manifest.drop.allowedBuyer);
  const nextDropId = await packSale.nextDropId();
  if (nextDropId < manifest.drop.expectedDropId) {
    throw new Error(`PackSale nextDropId ${nextDropId} is below expected ${manifest.drop.expectedDropId}`);
  }
  if (nextDropId === manifest.drop.expectedDropId) {
    await submit(
      "create reviewed private drop",
      packSale.createDrop({
        name: manifest.drop.name,
        price: manifest.drop.priceWei,
        startTime: manifest.drop.startTime,
        endTime: manifest.drop.endTime,
        maxSupply: 1n,
        maxPerWallet: 1n,
        allowlistRoot,
        inventoryIds: [manifest.inventory.inventoryId],
        metadataUris: [manifest.inventory.metadataUri],
        bonusTokenIds: manifest.drop.bonusItems.map(({ tokenId: id }) => id),
        bonusAmounts: manifest.drop.bonusItems.map(({ amount }) => amount),
        bonusUris: manifest.drop.bonusItems.map(({ tokenUri }) => tokenUri)
      })
    );
  }
  if ((await packSale.nextDropId()) <= manifest.drop.expectedDropId) {
    throw new Error("PackSale did not advance after reviewed drop creation");
  }

  const configuredDustPolicy = await packSale.dropDustPolicyId(manifest.drop.expectedDropId);
  if (configuredDustPolicy === 0n) {
    await submit(
      "attach reviewed Dust policy",
      packSale.setDropDustPolicy(manifest.drop.expectedDropId, manifest.drop.dustPolicyId)
    );
  } else if (configuredDustPolicy !== manifest.drop.dustPolicyId) {
    throw new Error(`Drop uses unexpected Dust policy ${configuredDustPolicy}`);
  }

  const summary = await packSale.getDropSummary(manifest.drop.expectedDropId);
  assertEqual(summary.name, manifest.drop.name, "drop name");
  assertEqual(summary.price, manifest.drop.priceWei, "drop price");
  assertEqual(summary.startTime, manifest.drop.startTime, "drop startTime");
  assertEqual(summary.endTime, manifest.drop.endTime, "drop endTime");
  assertEqual(summary.maxSupply, 1n, "drop maxSupply");
  assertEqual(summary.maxPerWallet, 1n, "drop maxPerWallet");
  assertEqual(summary.allowlistRoot.toLowerCase(), allowlistRoot.toLowerCase(), "drop allowlist root");
  assertEqual(summary.sold, 0n, "drop sold count");
  assertEqual(summary.pendingPurchases, 0n, "drop pending purchases");
  assertEqual(summary.remainingInventory, 1n, "drop remaining inventory");

  const [bonusIds, bonusAmounts, bonusUris] = await packSale.getDropBonus(manifest.drop.expectedDropId);
  assertEqual(bonusIds.length, manifest.drop.bonusItems.length, "bonus item count");
  manifest.drop.bonusItems.forEach((bonus, index) => {
    assertEqual(bonusIds[index], bonus.tokenId, `bonus ${index} token ID`);
    assertEqual(bonusAmounts[index], bonus.amount, `bonus ${index} amount`);
    assertEqual(bonusUris[index], bonus.tokenUri, `bonus ${index} URI`);
  });

  console.log(JSON.stringify({
    network: network.name,
    dropId: manifest.drop.expectedDropId.toString(),
    inventoryId: manifest.inventory.inventoryId,
    tokenId: tokenId.toString(),
    allowedBuyer: manifest.drop.allowedBuyer,
    allowlistProof: [],
    priceWei: manifest.drop.priceWei.toString(),
    remainingInventory: summary.remainingInventory.toString()
  }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
