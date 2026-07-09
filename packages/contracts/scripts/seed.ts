import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ethers, network } from "hardhat";
import type { BaseContract, BigNumberish, ContractTransactionResponse } from "ethers";
import ts from "typescript";

type CommonJsExports = Record<string, unknown>;

type InventoryItem = {
  inventoryId: string;
  brand: string;
  category: string;
  cardName: string;
  setName: string;
  cardNumber: string;
  language: string;
  edition: string;
  variant: string;
  rawConditionEstimate: string;
  conditionNotes: string;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  certUrl: string | null;
  photoUrls: string[];
  photoHash: string;
  vaultLocationLabel: string;
  custodyStatus: string;
  redeemable: boolean;
  marketEstimateCents: number;
  buybackQuoteCents: number;
  grailTier: string;
  craftingTags: string[];
  dropEligibility: boolean;
  legalDisclaimer: string;
  createdAt: string;
  updatedAt: string;
};

type DeploymentFile = {
  contracts: {
    InventoryRegistry: string;
    PackSale: string;
    Forge: string;
  };
};

type InventoryRegistryContract = BaseContract & {
  anchorInventory(
    inventoryId: string,
    inventoryHash: string,
    metadataUri: string,
    redeemable: boolean,
    grailProtected: boolean
  ): Promise<ContractTransactionResponse>;
  getInventory(inventoryId: string): Promise<unknown>;
};

type PackSaleContract = BaseContract & {
  nextDropId(): Promise<bigint>;
  createDrop(params: {
    name: string;
    price: BigNumberish;
    startTime: BigNumberish;
    endTime: BigNumberish;
    maxSupply: BigNumberish;
    inventoryIds: string[];
    metadataUris: string[];
  }): Promise<ContractTransactionResponse>;
};

type ForgeContract = BaseContract & {
  nextRecipeId(): Promise<bigint>;
  createRecipe(params: {
    inputTokenIds: BigNumberish[];
    inputAmounts: BigNumberish[];
    outputTokenId: BigNumberish;
    outputAmount: BigNumberish;
    outputUri: string;
    fee: BigNumberish;
    startTime: BigNumberish;
    endTime: BigNumberish;
    maxTotalCrafts: BigNumberish;
    maxCraftsPerWallet: BigNumberish;
    requiresManualReview: boolean;
    excludeGrailProtectedInputs: boolean;
  }): Promise<ContractTransactionResponse>;
  setRecipeStatus(recipeId: BigNumberish, status: BigNumberish): Promise<ContractTransactionResponse>;
};

const recipeStatus = {
  Simulated: 1,
  AdminReviewed: 2,
  Scheduled: 3,
  Active: 4
} as const;

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

function loadInventorySourceModule(
  filePath: string,
  moduleCache: Map<string, CommonJsExports>
): CommonJsExports {
  const cached = moduleCache.get(filePath);
  if (cached) {
    return cached;
  }

  const source = readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  }).outputText;
  const module = { exports: {} as CommonJsExports };
  moduleCache.set(filePath, module.exports);

  const requireForFile = (specifier: string): unknown => {
    if (specifier === "node:crypto" || specifier === "crypto") {
      return require(specifier);
    }

    if (specifier.startsWith(".")) {
      const resolvedPath = path.resolve(path.dirname(filePath), `${specifier}.ts`);
      return loadInventorySourceModule(resolvedPath, moduleCache);
    }

    return require(specifier);
  };

  vm.runInNewContext(
    transpiled,
    {
      __dirname: path.dirname(filePath),
      __filename: filePath,
      console,
      exports: module.exports,
      module,
      require: requireForFile
    },
    { filename: filePath }
  );

  return module.exports;
}

function loadSampleInventory(): InventoryItem[] {
  const sampleInventoryPath = path.resolve(
    __dirname,
    "../../inventory/src/sample-inventory.ts"
  );
  const exports = loadInventorySourceModule(sampleInventoryPath, new Map());
  const sampleInventory = exports.sampleInventory;

  if (!Array.isArray(sampleInventory)) {
    throw new Error(`sampleInventory export was not found in ${sampleInventoryPath}`);
  }

  return sampleInventory as InventoryItem[];
}

function stableInventoryHash(item: InventoryItem): string {
  const payload = {
    inventoryId: item.inventoryId,
    brand: item.brand,
    category: item.category,
    cardName: item.cardName,
    setName: item.setName,
    cardNumber: item.cardNumber,
    language: item.language,
    edition: item.edition,
    variant: item.variant,
    rawConditionEstimate: item.rawConditionEstimate,
    conditionNotes: item.conditionNotes,
    gradingCompany: item.gradingCompany,
    grade: item.grade,
    certNumber: item.certNumber,
    certUrl: item.certUrl,
    photoHash: item.photoHash,
    vaultLocationLabel: item.vaultLocationLabel,
    custodyStatus: item.custodyStatus,
    redeemable: item.redeemable,
    marketEstimateCents: item.marketEstimateCents,
    buybackQuoteCents: item.buybackQuoteCents,
    grailTier: item.grailTier,
    craftingTags: item.craftingTags,
    dropEligibility: item.dropEligibility,
    legalDisclaimer: item.legalDisclaimer,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };

  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)));
}

function metadataUriFor(inventoryId: string): string {
  return `ipfs://metadata/${inventoryId}.json`;
}

async function waitFor(tx: Promise<ContractTransactionResponse>): Promise<void> {
  const response = await tx;
  await response.wait();
}

async function anchorInventory(
  inventoryRegistry: InventoryRegistryContract,
  item: InventoryItem
): Promise<void> {
  try {
    await inventoryRegistry.getInventory(item.inventoryId);
    console.log(`inventory already anchored: ${item.inventoryId}`);
    return;
  } catch {
    await waitFor(
      inventoryRegistry.anchorInventory(
        item.inventoryId,
        stableInventoryHash(item),
        metadataUriFor(item.inventoryId),
        item.redeemable,
        item.grailTier === "grail"
      )
    );
    console.log(`anchored inventory: ${item.inventoryId}`);
  }
}

async function seedDrop(packSale: PackSaleContract, item: InventoryItem): Promise<void> {
  const nextDropId = await packSale.nextDropId();
  if (nextDropId > 1n) {
    console.log("drop seed skipped: PackSale already has at least one drop");
    return;
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Could not read latest block");
  }

  await waitFor(
    packSale.createDrop({
      name: `Sample Drop: ${item.cardName}`,
      price: ethers.parseEther("0.01"),
      startTime: latestBlock.timestamp - 60,
      endTime: latestBlock.timestamp + 30 * 24 * 60 * 60,
      maxSupply: 1,
      inventoryIds: [item.inventoryId],
      metadataUris: [metadataUriFor(item.inventoryId)]
    })
  );
  console.log(`created sample drop for ${item.inventoryId}`);
}

async function activateRecipe(forge: ForgeContract, recipeId: bigint): Promise<void> {
  await waitFor(forge.setRecipeStatus(recipeId, recipeStatus.Simulated));
  await waitFor(forge.setRecipeStatus(recipeId, recipeStatus.AdminReviewed));
  await waitFor(forge.setRecipeStatus(recipeId, recipeStatus.Scheduled));
  await waitFor(forge.setRecipeStatus(recipeId, recipeStatus.Active));
}

async function seedForgeRecipe(forge: ForgeContract): Promise<void> {
  const nextRecipeId = await forge.nextRecipeId();
  if (nextRecipeId > 1n) {
    console.log("recipe seed skipped: Forge already has at least one recipe");
    return;
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Could not read latest block");
  }

  const recipeId = nextRecipeId;
  await waitFor(
    forge.createRecipe({
      inputTokenIds: [
        ethers.toBigInt(ethers.id("game:sample-forge-input-a")),
        ethers.toBigInt(ethers.id("game:sample-forge-input-b"))
      ],
      inputAmounts: [1, 1],
      outputTokenId: ethers.toBigInt(ethers.id("game:sample-forge-output")),
      outputAmount: 1,
      outputUri: "ipfs://metadata/game/sample-forge-output.json",
      fee: ethers.parseEther("0.001"),
      startTime: latestBlock.timestamp - 60,
      endTime: latestBlock.timestamp + 30 * 24 * 60 * 60,
      maxTotalCrafts: 100,
      maxCraftsPerWallet: 5,
      requiresManualReview: false,
      excludeGrailProtectedInputs: true
    })
  );
  await activateRecipe(forge, recipeId);
  console.log(`created and activated sample Forge recipe ${recipeId}`);
}

async function main(): Promise<void> {
  const deployment = loadDeployment();
  const inventory = loadSampleInventory();
  const dropItem = inventory.find(
    (item) => item.dropEligibility && item.custodyStatus === "drop_ready"
  );

  if (!dropItem) {
    throw new Error("No drop-ready sample inventory item found");
  }

  const inventoryRegistry = (await ethers.getContractAt(
    "InventoryRegistry",
    deployment.contracts.InventoryRegistry
  )) as unknown as InventoryRegistryContract;
  const packSale = (await ethers.getContractAt(
    "PackSale",
    deployment.contracts.PackSale
  )) as unknown as PackSaleContract;
  const forge = (await ethers.getContractAt(
    "Forge",
    deployment.contracts.Forge
  )) as unknown as ForgeContract;

  for (const item of inventory) {
    await anchorInventory(inventoryRegistry, item);
  }

  await seedDrop(packSale, dropItem);
  await seedForgeRecipe(forge);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
