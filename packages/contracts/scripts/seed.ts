import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ethers, network } from "hardhat";
import type {
  BaseContract,
  BigNumberish,
  ContractTransactionResponse,
  TransactionResponse
} from "ethers";
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
  canonicalCollectibleKey: string;
  forgeTier: 1 | 2 | 3 | 4;
  tradeInEligible: boolean;
  tierPoolEligible: boolean;
  forgeSetKey: string;
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
    Marketplace: string;
    BuybackVault: string;
    Forge: string;
    DustRewardPolicy: string;
    CollectibleForgePolicy: string;
    VaultForge: string;
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
  derivePhysicalTokenId(inventoryId: string): Promise<bigint>;
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
    bonusTokenIds: BigNumberish[];
    bonusAmounts: BigNumberish[];
    bonusUris: string[];
  }): Promise<ContractTransactionResponse>;
  dropDustPolicyId(dropId: BigNumberish): Promise<bigint>;
  setDropDustPolicy(dropId: BigNumberish, policyId: BigNumberish): Promise<ContractTransactionResponse>;
};

type DustRewardPolicyView = {
  magicAmount: bigint;
  specialtyAmount: bigint;
  specialtyRolls: bigint;
  echoWeight: bigint;
  prismWeight: bigint;
  starWeight: bigint;
  active: boolean;
  exists: boolean;
};

type DustRewardPolicyContract = BaseContract & {
  nextPolicyId(): Promise<bigint>;
  createPolicy(
    magicAmount: BigNumberish,
    specialtyAmount: BigNumberish,
    specialtyRolls: BigNumberish,
    echoWeight: BigNumberish,
    prismWeight: BigNumberish,
    starWeight: BigNumberish
  ): Promise<ContractTransactionResponse>;
  getPolicy(policyId: BigNumberish): Promise<DustRewardPolicyView>;
};

type CollectibleForgePolicyContract = BaseContract & {
  hasPolicy(tokenId: BigNumberish): Promise<boolean>;
  setTokenPolicy(
    tokenId: BigNumberish,
    canonicalKey: string,
    setKey: string,
    tier: BigNumberish,
    tradeInEligible: boolean,
    tierPoolEligible: boolean
  ): Promise<ContractTransactionResponse>;
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

type VaultForgeContract = BaseContract & {
  getRecipeConfig(recipeKind: BigNumberish): Promise<VaultForgeRecipeView>;
  configureRecipe(
    recipeKind: BigNumberish,
    dustAmounts: readonly BigNumberish[],
    fee: BigNumberish,
    maxTotalClaims: BigNumberish,
    maxClaimsPerWallet: BigNumberish,
    active: boolean
  ): Promise<ContractTransactionResponse>;
  exchangeMagicCost(): Promise<bigint>;
  exchangeInputAmount(): Promise<bigint>;
  exchangeOutputAmount(): Promise<bigint>;
  configureDustExchange(
    magicCost: BigNumberish,
    inputAmount: BigNumberish,
    outputAmount: BigNumberish
  ): Promise<ContractTransactionResponse>;
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
    catalystTokenIds: BigNumberish[];
    catalystAmounts: BigNumberish[];
    outputSupplyCap: BigNumberish;
    metadataHash: string;
  }): Promise<ContractTransactionResponse>;
  setRecipeStatus(recipeId: BigNumberish, status: BigNumberish): Promise<ContractTransactionResponse>;
  getRecipeInputs(recipeId: BigNumberish): Promise<[bigint[], bigint[]]>;
  getRecipeCatalysts(recipeId: BigNumberish): Promise<[bigint[], bigint[]]>;
  recipes(recipeId: BigNumberish): Promise<ForgeRecipe>;
};

type MarketplaceContract = BaseContract & {
  feeBps(): Promise<bigint>;
  setFeeBps(feeBps: BigNumberish): Promise<ContractTransactionResponse>;
};

type BuybackQuote = readonly [bigint, boolean] & {
  price: bigint;
  active: boolean;
};

type BuybackVaultContract = BaseContract & {
  quotes(tokenId: BigNumberish): Promise<BuybackQuote>;
  totalPayoutCredit(): Promise<bigint>;
  setQuote(
    tokenId: BigNumberish,
    price: BigNumberish,
    active: boolean
  ): Promise<ContractTransactionResponse>;
};

type NativeTransactionSender = {
  sendTransaction(transaction: {
    to: string;
    value: BigNumberish;
  }): Promise<TransactionResponse>;
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
  outputSupplyCap: bigint;
  metadataHash: string;
  blueprintHash: string;
  reservationReleased: boolean;
};

const recipeStatus = {
  Draft: 0,
  Simulated: 1,
  AdminReviewed: 2,
  Scheduled: 3,
  Active: 4,
  Paused: 5
} as const;

const fireShardTokenId = 7_001n;
const vaultSealTokenId = 7_002n;
const forgeDustTokenId = 7_003n;
const resonanceDustTokenId = 7_004n;
const signalBadgeTokenId = 9_001n;
const resonanceAuraTokenId = 9_002n;
const curatorSigilTokenId = 9_003n;
const marketplaceFeeBps = 250n;
const sampleBuybackQuote = ethers.parseEther("0.004");
const sampleDustPolicy = {
  magicAmount: 100n,
  specialtyAmount: 10n,
  specialtyRolls: 2n,
  echoWeight: 5_000n,
  prismWeight: 3_500n,
  starWeight: 1_500n
} as const;

const sampleVaultForgeRecipes = [
  { dust: [5n, 10n, 0n, 0n], fee: ethers.parseEther("0.0005"), maxTotal: 1_000n, maxWallet: 100n },
  { dust: [8n, 12n, 0n, 4n], fee: ethers.parseEther("0.001"), maxTotal: 500n, maxWallet: 50n },
  { dust: [15n, 10n, 6n, 0n], fee: ethers.parseEther("0.0015"), maxTotal: 250n, maxWallet: 10n },
  { dust: [20n, 12n, 8n, 6n], fee: ethers.parseEther("0.0025"), maxTotal: 100n, maxWallet: 5n },
  { dust: [24n, 12n, 10n, 8n], fee: ethers.parseEther("0.002"), maxTotal: 100n, maxWallet: 5n }
] as const;

const sampleStarterMaterials = [
  {
    tokenId: fireShardTokenId,
    amount: 3n,
    tokenUri: "ipfs://metadata/game/fire-shard.json"
  },
  {
    tokenId: vaultSealTokenId,
    amount: 1n,
    tokenUri: "ipfs://metadata/game/vault-seal.json"
  }
] as const;

type SeedForgeRecipe = {
  inputTokenIds: readonly bigint[];
  inputAmounts: readonly bigint[];
  outputTokenId: bigint;
  outputAmount: bigint;
  outputUri: string;
  fee: bigint;
  maxTotalCrafts: bigint;
  maxCraftsPerWallet: bigint;
  requiresManualReview: boolean;
  excludeGrailProtectedInputs: boolean;
  catalystTokenIds: readonly bigint[];
  catalystAmounts: readonly bigint[];
  outputSupplyCap: bigint;
  metadataHash: string;
};

function sampleForgeRecipes(catalystTokenId: bigint): readonly SeedForgeRecipe[] {
  return [
    {
      inputTokenIds: [fireShardTokenId],
      inputAmounts: [2n],
      outputTokenId: forgeDustTokenId,
      outputAmount: 1n,
      outputUri: "ipfs://metadata/game/forge-dust.json",
      fee: 0n,
      maxTotalCrafts: 1_000n,
      maxCraftsPerWallet: 100n,
      requiresManualReview: false,
      excludeGrailProtectedInputs: true,
      catalystTokenIds: [],
      catalystAmounts: [],
      outputSupplyCap: 1_000n,
      metadataHash: ethers.id("forge-blueprint:duplicate-recycler:v3")
    },
    {
      inputTokenIds: [fireShardTokenId, vaultSealTokenId, forgeDustTokenId],
      inputAmounts: [1n, 1n, 1n],
      outputTokenId: signalBadgeTokenId,
      outputAmount: 1n,
      outputUri: "ipfs://metadata/game/signal-badge.json",
      fee: ethers.parseEther("0.001"),
      maxTotalCrafts: 100n,
      maxCraftsPerWallet: 5n,
      requiresManualReview: false,
      excludeGrailProtectedInputs: true,
      catalystTokenIds: [],
      catalystAmounts: [],
      outputSupplyCap: 100n,
      metadataHash: ethers.id("forge-blueprint:fire-signal:v3")
    },
    {
      inputTokenIds: [signalBadgeTokenId],
      inputAmounts: [1n],
      outputTokenId: resonanceAuraTokenId,
      outputAmount: 1n,
      outputUri: "ipfs://metadata/game/resonance-aura.json",
      fee: ethers.parseEther("0.002"),
      maxTotalCrafts: 25n,
      maxCraftsPerWallet: 1n,
      requiresManualReview: false,
      excludeGrailProtectedInputs: true,
      catalystTokenIds: [catalystTokenId],
      catalystAmounts: [1n],
      outputSupplyCap: 25n,
      metadataHash: ethers.id("forge-blueprint:vault-resonance:v3")
    },
    {
      inputTokenIds: [signalBadgeTokenId],
      inputAmounts: [1n],
      outputTokenId: resonanceDustTokenId,
      outputAmount: 1n,
      outputUri: "ipfs://metadata/game/resonance-dust.json",
      fee: 0n,
      maxTotalCrafts: 250n,
      maxCraftsPerWallet: 5n,
      requiresManualReview: false,
      excludeGrailProtectedInputs: true,
      catalystTokenIds: [resonanceAuraTokenId],
      catalystAmounts: [1n],
      outputSupplyCap: 250n,
      metadataHash: ethers.id("forge-blueprint:resonant-refinery:v3")
    },
    {
      inputTokenIds: [resonanceDustTokenId],
      inputAmounts: [1n],
      outputTokenId: curatorSigilTokenId,
      outputAmount: 1n,
      outputUri: "ipfs://metadata/game/curator-sigil.json",
      fee: ethers.parseEther("0.001"),
      maxTotalCrafts: 50n,
      maxCraftsPerWallet: 1n,
      requiresManualReview: false,
      excludeGrailProtectedInputs: true,
      catalystTokenIds: [resonanceAuraTokenId, catalystTokenId],
      catalystAmounts: [1n, 1n],
      outputSupplyCap: 50n,
      metadataHash: ethers.id("forge-blueprint:curator-sigil:v3")
    }
  ];
}

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
    canonicalCollectibleKey: item.canonicalCollectibleKey,
    forgeTier: item.forgeTier,
    tradeInEligible: item.tradeInEligible,
    tierPoolEligible: item.tierPoolEligible,
    forgeSetKey: item.forgeSetKey,
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

async function waitFor(tx: Promise<TransactionResponse>): Promise<void> {
  const response = await tx;
  await response.wait();
}

function assertSampleSeedAllowed(): void {
  if (network.name === "robinhoodMainnet") {
    throw new Error(
      "Sample seed blocked on Robinhood mainnet. Mainnet inventory, pricing, metadata, and liquidity must use a reviewed operator migration."
    );
  }
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
      metadataUris: [metadataUriFor(item.inventoryId)],
      bonusTokenIds: sampleStarterMaterials.map((material) => material.tokenId),
      bonusAmounts: sampleStarterMaterials.map((material) => material.amount),
      bonusUris: sampleStarterMaterials.map((material) => material.tokenUri)
    })
  );
  console.log(`created sample drop for ${item.inventoryId}`);
}

async function seedDustRewards(
  dustRewardPolicy: DustRewardPolicyContract,
  packSale: PackSaleContract
): Promise<void> {
  const nextPolicyId = await dustRewardPolicy.nextPolicyId();
  if (nextPolicyId === 1n) {
    await waitFor(
      dustRewardPolicy.createPolicy(
        sampleDustPolicy.magicAmount,
        sampleDustPolicy.specialtyAmount,
        sampleDustPolicy.specialtyRolls,
        sampleDustPolicy.echoWeight,
        sampleDustPolicy.prismWeight,
        sampleDustPolicy.starWeight
      )
    );
    console.log("created sample Dust reward policy 1");
  }

  const policy = await dustRewardPolicy.getPolicy(1n);
  if (
    policy.magicAmount !== sampleDustPolicy.magicAmount
      || policy.specialtyAmount !== sampleDustPolicy.specialtyAmount
      || policy.specialtyRolls !== sampleDustPolicy.specialtyRolls
      || policy.echoWeight !== sampleDustPolicy.echoWeight
      || policy.prismWeight !== sampleDustPolicy.prismWeight
      || policy.starWeight !== sampleDustPolicy.starWeight
  ) {
    throw new Error("Dust reward policy 1 does not match the reviewed sample policy");
  }

  const currentDropPolicy = await packSale.dropDustPolicyId(1n);
  if (currentDropPolicy === 0n) {
    await waitFor(packSale.setDropDustPolicy(1n, 1n));
    console.log("attached Dust reward policy 1 to sample drop 1");
  } else if (currentDropPolicy !== 1n) {
    throw new Error(`Sample drop 1 uses unexpected Dust policy ${currentDropPolicy}`);
  }
}

async function seedCollectiblePolicies(
  collectibleForgePolicy: CollectibleForgePolicyContract,
  inventoryRegistry: InventoryRegistryContract,
  inventory: readonly InventoryItem[]
): Promise<void> {
  for (const item of inventory) {
    const tokenId = await inventoryRegistry.derivePhysicalTokenId(item.inventoryId);
    if (await collectibleForgePolicy.hasPolicy(tokenId)) {
      console.log(`collectible Forge policy already configured: ${item.inventoryId}`);
      continue;
    }
    await waitFor(
      collectibleForgePolicy.setTokenPolicy(
        tokenId,
        ethers.id(item.canonicalCollectibleKey),
        ethers.id(item.forgeSetKey),
        item.forgeTier,
        item.tradeInEligible,
        item.tierPoolEligible
      )
    );
    console.log(`configured collectible Forge policy: ${item.inventoryId}`);
  }
}

async function seedVaultForge(vaultForge: VaultForgeContract): Promise<void> {
  for (const [recipeKind, expected] of sampleVaultForgeRecipes.entries()) {
    const current = await vaultForge.getRecipeConfig(recipeKind);
    if (current.version === 0n) {
      await waitFor(
        vaultForge.configureRecipe(
          recipeKind,
          expected.dust,
          expected.fee,
          expected.maxTotal,
          expected.maxWallet,
          true
        )
      );
      console.log(`configured VaultForge recipe ${recipeKind}`);
      continue;
    }
    if (
      current.fee !== expected.fee || current.maxTotalClaims !== expected.maxTotal
        || current.maxClaimsPerWallet !== expected.maxWallet || !current.active
        || current.dustAmounts.length !== expected.dust.length
        || current.dustAmounts.some((amount, index) => amount !== expected.dust[index])
    ) {
      throw new Error(`VaultForge recipe ${recipeKind} does not match the reviewed sample config`);
    }
  }

  const exchange = [
    await vaultForge.exchangeMagicCost(),
    await vaultForge.exchangeInputAmount(),
    await vaultForge.exchangeOutputAmount()
  ] as const;
  if (exchange.every((value) => value === 0n)) {
    await waitFor(vaultForge.configureDustExchange(5n, 3n, 1n));
    console.log("configured VaultForge Dust Exchange at 3:1 plus 5 Magic Dust");
  } else if (exchange[0] !== 5n || exchange[1] !== 3n || exchange[2] !== 1n) {
    throw new Error("VaultForge Dust Exchange does not match the reviewed sample config");
  }
}

async function configureMarketplace(marketplace: MarketplaceContract): Promise<void> {
  const currentFeeBps = await marketplace.feeBps();
  if (currentFeeBps === marketplaceFeeBps) {
    console.log(`Marketplace fee already configured at ${marketplaceFeeBps} bps`);
    return;
  }

  await waitFor(marketplace.setFeeBps(marketplaceFeeBps));
  console.log(`configured Marketplace fee at ${marketplaceFeeBps} bps`);
}

async function seedBuybackLiquidity(
  buybackVault: BuybackVaultContract,
  physicalTokenId: bigint,
  deployer: NativeTransactionSender
): Promise<void> {
  const quote = await buybackVault.quotes(physicalTokenId);
  if (quote.price !== sampleBuybackQuote || !quote.active) {
    await waitFor(buybackVault.setQuote(physicalTokenId, sampleBuybackQuote, true));
    console.log(
      `configured BuybackVault quote for ${physicalTokenId} at ${ethers.formatEther(sampleBuybackQuote)} ETH`
    );
  } else {
    console.log(`BuybackVault quote already configured for ${physicalTokenId}`);
  }

  const vaultAddress = await buybackVault.getAddress();
  const vaultBalance = await ethers.provider.getBalance(vaultAddress);
  const payoutCredit = await buybackVault.totalPayoutCredit();
  if (vaultBalance < payoutCredit) {
    throw new Error(
      `BuybackVault balance ${vaultBalance} is below reserved payout credit ${payoutCredit}`
    );
  }

  const availableLiquidity = vaultBalance - payoutCredit;
  if (availableLiquidity >= sampleBuybackQuote) {
    console.log(
      `BuybackVault already has ${ethers.formatEther(availableLiquidity)} ETH available liquidity`
    );
    return;
  }

  const topUp = sampleBuybackQuote - availableLiquidity;
  await waitFor(deployer.sendTransaction({ to: vaultAddress, value: topUp }));
  console.log(`funded BuybackVault with ${ethers.formatEther(topUp)} ETH`);
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

async function seedForgeRecipes(forge: ForgeContract, recipes: readonly SeedForgeRecipe[]): Promise<void> {
  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Could not read latest block");
  }

  for (const [index, recipe] of recipes.entries()) {
    const recipeId = BigInt(index + 1);
    const nextRecipeId = await forge.nextRecipeId();
    if (nextRecipeId > recipeId) {
      await validateSampleForgeRecipe(forge, recipeId, recipe);
      await activateRecipe(forge, recipeId);
      continue;
    }

    if (nextRecipeId < recipeId) {
      throw new Error(`Forge nextRecipeId ${nextRecipeId} is behind expected recipe ${recipeId}`);
    }

    await waitFor(
      forge.createRecipe({
        inputTokenIds: [...recipe.inputTokenIds],
        inputAmounts: [...recipe.inputAmounts],
        outputTokenId: recipe.outputTokenId,
        outputAmount: recipe.outputAmount,
        outputUri: recipe.outputUri,
        fee: recipe.fee,
        startTime: latestBlock.timestamp - 60,
        endTime: latestBlock.timestamp + 30 * 24 * 60 * 60,
        maxTotalCrafts: recipe.maxTotalCrafts,
        maxCraftsPerWallet: recipe.maxCraftsPerWallet,
        requiresManualReview: recipe.requiresManualReview,
        excludeGrailProtectedInputs: recipe.excludeGrailProtectedInputs,
        catalystTokenIds: [...recipe.catalystTokenIds],
        catalystAmounts: [...recipe.catalystAmounts],
        outputSupplyCap: recipe.outputSupplyCap,
        metadataHash: recipe.metadataHash
      })
    );
    await activateRecipe(forge, recipeId);
    console.log(`created and activated sample Forge recipe ${recipeId}`);
  }
}

async function ensureSampleForgeInputs(
  itemToken: ItemTokenContract,
  forge: ForgeContract,
  deployerAddress: string
): Promise<void> {
  const mintPlan: Array<{ tokenId: bigint; amount: bigint }> = [];
  for (const material of sampleStarterMaterials) {
    const balance = await itemToken.balanceOf(deployerAddress, material.tokenId);
    if (balance < material.amount) {
      mintPlan.push({ tokenId: material.tokenId, amount: material.amount - balance });
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
        const material = sampleStarterMaterials.find((entry) => entry.tokenId === tokenId);
        if (!material) {
          throw new Error(`Missing starter material metadata for ${tokenId}`);
        }
        await waitFor(
          itemToken.mintGameItem(deployerAddress, tokenId, amount, material.tokenUri)
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

async function validateSampleForgeRecipe(
  forge: ForgeContract,
  recipeId: bigint,
  expectedRecipe: SeedForgeRecipe
): Promise<void> {
  const recipe = await forge.recipes(recipeId);
  if (!recipe.exists) {
    throw new Error(`Forge recipe ${recipeId} is missing even though nextRecipeId advanced`);
  }

  const [inputTokenIds, inputAmounts] = await forge.getRecipeInputs(recipeId);
  const [catalystTokenIds, catalystAmounts] = await forge.getRecipeCatalysts(recipeId);
  const mismatches = [
    ...compareBigintArrays("inputTokenIds", inputTokenIds, expectedRecipe.inputTokenIds),
    ...compareBigintArrays("inputAmounts", inputAmounts, expectedRecipe.inputAmounts),
    ...compareBigintArrays("catalystTokenIds", catalystTokenIds, expectedRecipe.catalystTokenIds),
    ...compareBigintArrays("catalystAmounts", catalystAmounts, expectedRecipe.catalystAmounts),
    ...compareBigint("outputTokenId", recipe.outputTokenId, expectedRecipe.outputTokenId),
    ...compareBigint("outputAmount", recipe.outputAmount, expectedRecipe.outputAmount),
    ...compareString("outputUri", recipe.outputUri, expectedRecipe.outputUri),
    ...compareBigint("fee", recipe.fee, expectedRecipe.fee),
    ...compareBigint("maxTotalCrafts", recipe.maxTotalCrafts, expectedRecipe.maxTotalCrafts),
    ...compareBigint("maxCraftsPerWallet", recipe.maxCraftsPerWallet, expectedRecipe.maxCraftsPerWallet),
    ...compareBigint("outputSupplyCap", recipe.outputSupplyCap, expectedRecipe.outputSupplyCap),
    ...compareString("metadataHash", recipe.metadataHash, expectedRecipe.metadataHash),
    ...compareBoolean("requiresManualReview", recipe.requiresManualReview, expectedRecipe.requiresManualReview),
    ...compareBoolean(
      "excludeGrailProtectedInputs",
      recipe.excludeGrailProtectedInputs,
      expectedRecipe.excludeGrailProtectedInputs
    )
  ];

  if (mismatches.length > 0) {
    throw new Error(
      `Forge recipe ${recipeId} exists but does not match the sample seed recipe: ${mismatches.join("; ")}`
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
  assertSampleSeedAllowed();

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
  const marketplace = (await ethers.getContractAt(
    "Marketplace",
    deployment.contracts.Marketplace
  )) as unknown as MarketplaceContract;
  const buybackVault = (await ethers.getContractAt(
    "BuybackVault",
    deployment.contracts.BuybackVault
  )) as unknown as BuybackVaultContract;
  const forge = (await ethers.getContractAt(
    "Forge",
    deployment.contracts.Forge
  )) as unknown as ForgeContract;
  const dustRewardPolicy = (await ethers.getContractAt(
    "DustRewardPolicy",
    deployment.contracts.DustRewardPolicy
  )) as unknown as DustRewardPolicyContract;
  const collectibleForgePolicy = (await ethers.getContractAt(
    "CollectibleForgePolicy",
    deployment.contracts.CollectibleForgePolicy
  )) as unknown as CollectibleForgePolicyContract;
  const vaultForge = (await ethers.getContractAt(
    "VaultForge",
    deployment.contracts.VaultForge
  )) as unknown as VaultForgeContract;

  for (const item of inventory) {
    await anchorInventory(inventoryRegistry, item);
  }

  await seedDrop(packSale, dropItem);
  await seedDustRewards(dustRewardPolicy, packSale);
  await seedCollectiblePolicies(collectibleForgePolicy, inventoryRegistry, inventory);
  await seedVaultForge(vaultForge);
  await configureMarketplace(marketplace);
  await ensureSampleForgeInputs(itemToken, forge, deployerAddress);
  const catalystTokenId = await inventoryRegistry.derivePhysicalTokenId(dropItem.inventoryId);
  await seedForgeRecipes(forge, sampleForgeRecipes(catalystTokenId));
  await seedBuybackLiquidity(buybackVault, catalystTokenId, deployer);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
