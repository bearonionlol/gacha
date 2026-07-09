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
    ItemToken: string;
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

type ItemTokenContract = BaseContract & {
  MINTER_ROLE(): Promise<string>;
  hasRole(role: string, account: string): Promise<boolean>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  revokeRole(role: string, account: string): Promise<ContractTransactionResponse>;
  balanceOf(account: string, tokenId: BigNumberish): Promise<bigint>;
  mintGameItem(
    to: string,
    tokenId: BigNumberish,
    amount: BigNumberish,
    tokenUri: string
  ): Promise<ContractTransactionResponse>;
  isApprovedForAll(owner: string, operator: string): Promise<boolean>;
  setApprovalForAll(operator: string, approved: boolean): Promise<ContractTransactionResponse>;
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
  getRecipeInputs(recipeId: BigNumberish): Promise<[bigint[], bigint[]]>;
  recipes(recipeId: BigNumberish): Promise<ForgeRecipe>;
};

type ForgeRecipe = {
  outputTokenId: bigint;
  outputAmount: bigint;
  outputUri: string;
  fee: bigint;
  startTime: bigint;
  endTime: bigint;
  maxTotalCrafts: bigint;
  maxCraftsPerWallet: bigint;
  totalCrafts: bigint;
  status: bigint;
  requiresManualReview: boolean;
  excludeGrailProtectedInputs: boolean;
  exists: boolean;
};

const recipeStatus = {
  Draft: 0,
  Simulated: 1,
  AdminReviewed: 2,
  Scheduled: 3,
  Active: 4,
  Paused: 5
} as const;

const sampleRecipeId = 1n;
const sampleForgeRecipe = {
  inputTokenIds: [7_001n, 7_002n],
  inputAmounts: [1n, 1n],
  outputTokenId: 9_001n,
  outputAmount: 1n,
  outputUri: "ipfs://metadata/game/sample-forge-output.json",
  fee: ethers.parseEther("0.001"),
  maxTotalCrafts: 100n,
  maxCraftsPerWallet: 5n,
  requiresManualReview: false,
  excludeGrailProtectedInputs: true
} as const;

const inventoryRegistryErrors = new ethers.Interface([
  "error InventoryNotAnchored(string inventoryId)"
]);

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
      const resolvedPath = resolveRelativeInventoryModule(filePath, specifier);
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

function resolveRelativeInventoryModule(fromFilePath: string, specifier: string): string {
  const basePath = path.resolve(path.dirname(fromFilePath), specifier);
  const candidatePaths = path.extname(basePath)
    ? [basePath]
    : [basePath, `${basePath}.ts`, `${basePath}.js`, path.join(basePath, "index.ts")];
  const resolvedPath = candidatePaths.find((candidatePath) => existsSync(candidatePath));

  if (!resolvedPath) {
    throw new Error(`Could not resolve ${specifier} from ${fromFilePath}`);
  }

  return resolvedPath;
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
  } catch (error: unknown) {
    if (!isInventoryNotAnchoredError(error, item.inventoryId)) {
      throw error;
    }

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

function isInventoryNotAnchoredError(error: unknown, inventoryId: string): boolean {
  const data = extractErrorData(error);
  if (data) {
    try {
      const parsed = inventoryRegistryErrors.parseError(data);
      return parsed?.name === "InventoryNotAnchored" && parsed.args[0] === inventoryId;
    } catch {
      return false;
    }
  }

  return extractErrorMessages(error).some((message) =>
    message.includes(`custom error 'InventoryNotAnchored("${inventoryId}")'`)
  );
}

function extractErrorData(error: unknown, seen = new Set<unknown>()): string | undefined {
  if (!error || typeof error !== "object" || seen.has(error)) {
    return undefined;
  }

  seen.add(error);
  const record = error as Record<string, unknown>;
  if (typeof record.data === "string" && record.data.startsWith("0x")) {
    return record.data;
  }

  for (const key of ["error", "info", "receipt"] as const) {
    const nestedData = extractErrorData(record[key], seen);
    if (nestedData) {
      return nestedData;
    }
  }

  return undefined;
}

function extractErrorMessages(error: unknown, seen = new Set<unknown>()): string[] {
  if (!error || typeof error !== "object" || seen.has(error)) {
    return [];
  }

  seen.add(error);
  const record = error as Record<string, unknown>;
  const messages = typeof record.message === "string" ? [record.message] : [];

  for (const key of ["error", "info", "receipt"] as const) {
    messages.push(...extractErrorMessages(record[key], seen));
  }

  return messages;
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
  const recipe = await forge.recipes(recipeId);
  if (recipe.status === BigInt(recipeStatus.Active)) {
    console.log(`Forge recipe ${recipeId} already active`);
    return;
  }

  const transitionsByStatus = new Map<bigint, readonly number[]>([
    [BigInt(recipeStatus.Draft), [recipeStatus.Simulated, recipeStatus.AdminReviewed, recipeStatus.Scheduled, recipeStatus.Active]],
    [BigInt(recipeStatus.Simulated), [recipeStatus.AdminReviewed, recipeStatus.Scheduled, recipeStatus.Active]],
    [BigInt(recipeStatus.AdminReviewed), [recipeStatus.Scheduled, recipeStatus.Active]],
    [BigInt(recipeStatus.Scheduled), [recipeStatus.Active]],
    [BigInt(recipeStatus.Paused), [recipeStatus.Active]]
  ]);
  const transitions = transitionsByStatus.get(recipe.status);
  if (!transitions) {
    throw new Error(`Sample Forge recipe ${recipeId} cannot be activated from status ${recipe.status}`);
  }

  for (const status of transitions) {
    await waitFor(forge.setRecipeStatus(recipeId, status));
  }
}

async function seedForgeRecipe(forge: ForgeContract): Promise<void> {
  const nextRecipeId = await forge.nextRecipeId();
  if (nextRecipeId > sampleRecipeId) {
    await validateSampleForgeRecipe(forge);
    await activateRecipe(forge, sampleRecipeId);
    return;
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Could not read latest block");
  }

  await waitFor(
    forge.createRecipe({
      inputTokenIds: [...sampleForgeRecipe.inputTokenIds],
      inputAmounts: [...sampleForgeRecipe.inputAmounts],
      outputTokenId: sampleForgeRecipe.outputTokenId,
      outputAmount: sampleForgeRecipe.outputAmount,
      outputUri: sampleForgeRecipe.outputUri,
      fee: sampleForgeRecipe.fee,
      startTime: latestBlock.timestamp - 60,
      endTime: latestBlock.timestamp + 30 * 24 * 60 * 60,
      maxTotalCrafts: sampleForgeRecipe.maxTotalCrafts,
      maxCraftsPerWallet: sampleForgeRecipe.maxCraftsPerWallet,
      requiresManualReview: sampleForgeRecipe.requiresManualReview,
      excludeGrailProtectedInputs: sampleForgeRecipe.excludeGrailProtectedInputs
    })
  );
  await activateRecipe(forge, sampleRecipeId);
  console.log(`created and activated sample Forge recipe ${sampleRecipeId}`);
}

async function ensureSampleForgeInputs(
  itemToken: ItemTokenContract,
  forge: ForgeContract,
  deployerAddress: string
): Promise<void> {
  const mintPlan: Array<{ tokenId: bigint; amount: bigint }> = [];
  for (let index = 0; index < sampleForgeRecipe.inputTokenIds.length; index++) {
    const tokenId = sampleForgeRecipe.inputTokenIds[index];
    const requiredAmount = sampleForgeRecipe.inputAmounts[index];
    if (tokenId === undefined || requiredAmount === undefined) {
      throw new Error(`Missing sample Forge recipe input at index ${index}`);
    }

    const balance = await itemToken.balanceOf(deployerAddress, tokenId);
    if (balance < requiredAmount) {
      mintPlan.push({ tokenId, amount: requiredAmount - balance });
    }
  }

  if (mintPlan.length > 0) {
    const minterRole = await itemToken.MINTER_ROLE();
    const hadMinterRole = await itemToken.hasRole(minterRole, deployerAddress);
    let grantedMinterRole = false;

    if (!hadMinterRole) {
      await waitFor(itemToken.grantRole(minterRole, deployerAddress));
      grantedMinterRole = true;
      console.log(`temporarily granted ItemToken.MINTER_ROLE to ${deployerAddress}`);
    }

    try {
      for (const { tokenId, amount } of mintPlan) {
        await waitFor(
          itemToken.mintGameItem(
            deployerAddress,
            tokenId,
            amount,
            `ipfs://metadata/game/sample-forge-input-${tokenId}.json`
          )
        );
        console.log(`minted ${amount} sample Forge input ${tokenId} to ${deployerAddress}`);
      }
    } finally {
      if (grantedMinterRole) {
        await waitFor(itemToken.revokeRole(minterRole, deployerAddress));
        console.log(`revoked temporary ItemToken.MINTER_ROLE from ${deployerAddress}`);
      }
    }
  } else {
    console.log("sample Forge inputs already present for deployer");
  }

  const forgeAddress = await forge.getAddress();
  if (await itemToken.isApprovedForAll(deployerAddress, forgeAddress)) {
    console.log("Forge already approved for deployer sample inputs");
    return;
  }

  await waitFor(itemToken.setApprovalForAll(forgeAddress, true));
  console.log(`approved Forge ${forgeAddress} for deployer sample inputs`);
}

async function validateSampleForgeRecipe(forge: ForgeContract): Promise<void> {
  const recipe = await forge.recipes(sampleRecipeId);
  if (!recipe.exists) {
    throw new Error(`Forge recipe ${sampleRecipeId} is missing even though nextRecipeId advanced`);
  }

  const [inputTokenIds, inputAmounts] = await forge.getRecipeInputs(sampleRecipeId);
  const mismatches = [
    ...compareBigintArrays("inputTokenIds", inputTokenIds, sampleForgeRecipe.inputTokenIds),
    ...compareBigintArrays("inputAmounts", inputAmounts, sampleForgeRecipe.inputAmounts),
    ...compareBigint("outputTokenId", recipe.outputTokenId, sampleForgeRecipe.outputTokenId),
    ...compareBigint("outputAmount", recipe.outputAmount, sampleForgeRecipe.outputAmount),
    ...compareString("outputUri", recipe.outputUri, sampleForgeRecipe.outputUri),
    ...compareBigint("fee", recipe.fee, sampleForgeRecipe.fee),
    ...compareBigint("maxTotalCrafts", recipe.maxTotalCrafts, sampleForgeRecipe.maxTotalCrafts),
    ...compareBigint("maxCraftsPerWallet", recipe.maxCraftsPerWallet, sampleForgeRecipe.maxCraftsPerWallet),
    ...compareBoolean("requiresManualReview", recipe.requiresManualReview, sampleForgeRecipe.requiresManualReview),
    ...compareBoolean(
      "excludeGrailProtectedInputs",
      recipe.excludeGrailProtectedInputs,
      sampleForgeRecipe.excludeGrailProtectedInputs
    )
  ];

  if (mismatches.length > 0) {
    throw new Error(
      `Forge recipe ${sampleRecipeId} exists but does not match the sample seed recipe: ${mismatches.join("; ")}`
    );
  }
}

function compareBigint(label: string, actual: bigint, expected: bigint): string[] {
  return actual === expected ? [] : [`${label} expected ${expected} got ${actual}`];
}

function compareString(label: string, actual: string, expected: string): string[] {
  return actual === expected ? [] : [`${label} expected ${expected} got ${actual}`];
}

function compareBoolean(label: string, actual: boolean, expected: boolean): string[] {
  return actual === expected ? [] : [`${label} expected ${expected} got ${actual}`];
}

function compareBigintArrays(
  label: string,
  actual: readonly bigint[],
  expected: readonly bigint[]
): string[] {
  const mismatches: string[] = [];
  if (actual.length !== expected.length) {
    mismatches.push(`${label} length expected ${expected.length} got ${actual.length}`);
  }

  const comparableLength = Math.min(actual.length, expected.length);
  for (let index = 0; index < comparableLength; index++) {
    if (actual[index] !== expected[index]) {
      mismatches.push(`${label}[${index}] expected ${expected[index]} got ${actual[index]}`);
    }
  }

  return mismatches;
}

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer is configured");
  }

  const deployerAddress = await deployer.getAddress();
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
  const itemToken = (await ethers.getContractAt(
    "ItemToken",
    deployment.contracts.ItemToken
  )) as unknown as ItemTokenContract;
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
  await ensureSampleForgeInputs(itemToken, forge, deployerAddress);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
