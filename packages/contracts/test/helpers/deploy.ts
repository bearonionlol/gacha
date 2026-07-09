import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { BaseContract, BigNumberish, ContractRunner, ContractTransactionResponse } from "ethers";

const REQUESTER_ROLE = ethers.id("REQUESTER_ROLE");

export interface InventoryRecord {
  inventoryId: string;
  inventoryHash: string;
  metadataUri: string;
  redeemable: boolean;
  grailProtected: boolean;
  tokenId: bigint;
  tokenized: boolean;
  owner: string;
}

export type InventoryRegistry = Omit<BaseContract, "connect"> & {
  INVENTORY_ADMIN_ROLE(): Promise<string>;
  TOKENIZER_ROLE(): Promise<string>;
  derivePhysicalTokenId(inventoryId: string): Promise<bigint>;
  anchorInventory(
    inventoryId: string,
    inventoryHash: string,
    metadataUri: string,
    redeemable: boolean,
    grailProtected: boolean
  ): Promise<ContractTransactionResponse>;
  markTokenized(inventoryId: string, owner: string): Promise<ContractTransactionResponse>;
  getInventory(inventoryId: string): Promise<InventoryRecord>;
  getInventoryByTokenId(tokenId: BigNumberish): Promise<InventoryRecord>;
  isGrailProtectedToken(tokenId: BigNumberish): Promise<boolean>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): InventoryRegistry;
};

export type ItemToken = Omit<BaseContract, "connect"> & {
  MINTER_ROLE(): Promise<string>;
  BURNER_ROLE(): Promise<string>;
  URI_SETTER_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  balanceOf(account: string, tokenId: BigNumberish): Promise<bigint>;
  "totalSupply(uint256)"(tokenId: BigNumberish): Promise<bigint>;
  tokenKind(tokenId: BigNumberish): Promise<bigint>;
  hasCustomURI(tokenId: BigNumberish): Promise<boolean>;
  uri(tokenId: BigNumberish): Promise<string>;
  mintInventoryItem(
    to: string,
    tokenId: BigNumberish,
    inventoryId: string,
    tokenUri: string
  ): Promise<ContractTransactionResponse>;
  mintGameItem(
    to: string,
    tokenId: BigNumberish,
    amount: BigNumberish,
    tokenUri: string
  ): Promise<ContractTransactionResponse>;
  burn(from: string, tokenId: BigNumberish, amount: BigNumberish): Promise<ContractTransactionResponse>;
  setTokenURI(tokenId: BigNumberish, tokenUri: string): Promise<ContractTransactionResponse>;
  pause(): Promise<ContractTransactionResponse>;
  unpause(): Promise<ContractTransactionResponse>;
  setApprovalForAll(operator: string, approved: boolean): Promise<ContractTransactionResponse>;
  safeTransferFrom(
    from: string,
    to: string,
    tokenId: BigNumberish,
    amount: BigNumberish,
    data: string
  ): Promise<ContractTransactionResponse>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  revokeRole(role: string, account: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): ItemToken;
};

export type RandomnessProvider = Omit<BaseContract, "connect"> & {
  REQUESTER_ROLE(): Promise<string>;
  REVEALER_ROLE(): Promise<string>;
  requestRandomness(requestId: string): Promise<ContractTransactionResponse>;
  readRandomness(requestId: string): Promise<[boolean, bigint]>;
  commitRandomness(requestId: string, commitment: string): Promise<ContractTransactionResponse>;
  revealRandomness(requestId: string, seed: string): Promise<ContractTransactionResponse>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): RandomnessProvider;
};

export interface CreateDropParams {
  name: string;
  price: BigNumberish;
  startTime: BigNumberish;
  endTime: BigNumberish;
  maxSupply: BigNumberish;
  inventoryIds: string[];
  metadataUris: string[];
}

export type PackSale = Omit<BaseContract, "connect"> & {
  DROP_ADMIN_ROLE(): Promise<string>;
  REFUND_TIMEOUT(): Promise<bigint>;
  createDrop(params: CreateDropParams): Promise<ContractTransactionResponse>;
  purchase(dropId: BigNumberish, overrides?: { value?: BigNumberish }): Promise<ContractTransactionResponse>;
  reveal(purchaseId: BigNumberish): Promise<ContractTransactionResponse>;
  claimRevealedTokenTo(purchaseId: BigNumberish, to: string): Promise<ContractTransactionResponse>;
  refundCredit(account: string): Promise<bigint>;
  refundExpiredPurchase(purchaseId: BigNumberish): Promise<ContractTransactionResponse>;
  withdrawRefund(): Promise<ContractTransactionResponse>;
  closeDrop(dropId: BigNumberish): Promise<ContractTransactionResponse>;
  remainingInventory(dropId: BigNumberish): Promise<bigint>;
  pause(): Promise<ContractTransactionResponse>;
  unpause(): Promise<ContractTransactionResponse>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): PackSale;
};

export interface ListingRecord {
  seller: string;
  tokenId: bigint;
  amount: bigint;
  price: bigint;
  active: boolean;
  sold: boolean;
  cancelled: boolean;
}

export type Marketplace = Omit<BaseContract, "connect"> & {
  MARKET_ADMIN_ROLE(): Promise<string>;
  feeBps(): Promise<bigint>;
  treasury(): Promise<string>;
  proceedsCredit(account: string): Promise<bigint>;
  listings(listingId: BigNumberish): Promise<ListingRecord>;
  list(tokenId: BigNumberish, amount: BigNumberish, price: BigNumberish): Promise<ContractTransactionResponse>;
  cancel(listingId: BigNumberish): Promise<ContractTransactionResponse>;
  buy(listingId: BigNumberish, overrides?: { value?: BigNumberish }): Promise<ContractTransactionResponse>;
  withdrawProceeds(): Promise<ContractTransactionResponse>;
  withdrawProceedsTo(to: string): Promise<ContractTransactionResponse>;
  setFeeBps(feeBps: BigNumberish): Promise<ContractTransactionResponse>;
  setTreasury(treasury: string): Promise<ContractTransactionResponse>;
  pause(): Promise<ContractTransactionResponse>;
  unpause(): Promise<ContractTransactionResponse>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): Marketplace;
};

export interface QuoteRecord {
  price: bigint;
  active: boolean;
}

export type BuybackVault = Omit<BaseContract, "connect"> & {
  BUYBACK_ADMIN_ROLE(): Promise<string>;
  payoutCredit(account: string): Promise<bigint>;
  quotes(tokenId: BigNumberish): Promise<QuoteRecord>;
  setQuote(
    tokenId: BigNumberish,
    price: BigNumberish,
    active: boolean
  ): Promise<ContractTransactionResponse>;
  acceptQuote(tokenId: BigNumberish, amount: BigNumberish): Promise<ContractTransactionResponse>;
  withdrawToken(
    to: string,
    tokenId: BigNumberish,
    amount: BigNumberish
  ): Promise<ContractTransactionResponse>;
  withdrawNative(to: string, amount: BigNumberish): Promise<ContractTransactionResponse>;
  withdrawPayout(): Promise<ContractTransactionResponse>;
  withdrawPayoutTo(to: string): Promise<ContractTransactionResponse>;
  pause(): Promise<ContractTransactionResponse>;
  unpause(): Promise<ContractTransactionResponse>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): BuybackVault;
};

export interface CreateRecipeParams {
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
}

export interface ForgeRecipe {
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
}

export type Forge = Omit<BaseContract, "connect"> & {
  RECIPE_ADMIN_ROLE(): Promise<string>;
  nextRecipeId(): Promise<bigint>;
  createRecipe(params: CreateRecipeParams): Promise<ContractTransactionResponse>;
  setRecipeStatus(
    recipeId: BigNumberish,
    status: BigNumberish
  ): Promise<ContractTransactionResponse>;
  craft(
    recipeId: BigNumberish,
    overrides?: { value?: BigNumberish }
  ): Promise<ContractTransactionResponse>;
  getRecipeInputs(recipeId: BigNumberish): Promise<[bigint[], bigint[]]>;
  recipes(recipeId: BigNumberish): Promise<ForgeRecipe>;
  walletCrafts(recipeId: BigNumberish, account: string): Promise<bigint>;
  treasuryFeesCredit(account: string): Promise<bigint>;
  withdrawTreasuryFees(): Promise<ContractTransactionResponse>;
  withdrawTreasuryFeesTo(to: string): Promise<ContractTransactionResponse>;
  pause(): Promise<ContractTransactionResponse>;
  unpause(): Promise<ContractTransactionResponse>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): Forge;
};

export interface RedemptionRequest {
  requester: string;
  tokenId: bigint;
  status: bigint;
  trackingRef: string;
  reason: string;
}

export type RedemptionRegistry = Omit<BaseContract, "connect"> & {
  REDEMPTION_ADMIN_ROLE(): Promise<string>;
  nextRequestId(): Promise<bigint>;
  requestRedemption(tokenId: BigNumberish): Promise<ContractTransactionResponse>;
  approve(requestId: BigNumberish): Promise<ContractTransactionResponse>;
  markPacked(requestId: BigNumberish): Promise<ContractTransactionResponse>;
  markShipped(
    requestId: BigNumberish,
    trackingRef: string
  ): Promise<ContractTransactionResponse>;
  complete(requestId: BigNumberish): Promise<ContractTransactionResponse>;
  cancel(requestId: BigNumberish, reason: string): Promise<ContractTransactionResponse>;
  requests(requestId: BigNumberish): Promise<RedemptionRequest>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  supportsInterface(interfaceId: string): Promise<boolean>;
  connect(runner: ContractRunner | null): RedemptionRegistry;
};

function requireSigner(
  signers: HardhatEthersSigner[],
  index: number,
  label: string
): HardhatEthersSigner {
  const signer = signers[index];
  if (!signer) {
    throw new Error(`Missing ${label} signer`);
  }

  return signer;
}

export async function deployInventoryRegistryFixture() {
  const signers = await ethers.getSigners();
  const deployer = requireSigner(signers, 0, "deployer");
  const inventoryAdmin = requireSigner(signers, 1, "inventory admin");
  const tokenizer = requireSigner(signers, 2, "tokenizer");
  const owner = requireSigner(signers, 3, "owner");
  const other = requireSigner(signers, 4, "other");
  const registry = (await ethers.deployContract("InventoryRegistry")) as unknown as InventoryRegistry;

  await registry.waitForDeployment();
  await registry.grantRole(await registry.INVENTORY_ADMIN_ROLE(), inventoryAdmin.address);
  await registry.grantRole(await registry.TOKENIZER_ROLE(), tokenizer.address);

  return {
    registry,
    deployer,
    inventoryAdmin,
    tokenizer,
    owner,
    other
  };
}

export async function deployRandomnessProviderFixture() {
  const signers = await ethers.getSigners();
  const deployer = requireSigner(signers, 0, "deployer");
  const revealer = requireSigner(signers, 1, "revealer");
  const other = requireSigner(signers, 2, "other");
  const requester = requireSigner(signers, 3, "requester");
  const randomnessProvider = (await ethers.deployContract(
    "CommitRevealRandomnessProvider"
  )) as unknown as RandomnessProvider;

  await randomnessProvider.waitForDeployment();
  await randomnessProvider.grantRole(REQUESTER_ROLE, requester.address);
  await randomnessProvider.grantRole(await randomnessProvider.REVEALER_ROLE(), revealer.address);

  return {
    randomnessProvider,
    deployer,
    revealer,
    requester,
    other
  };
}

export async function deployProtocolFixture() {
  const signers = await ethers.getSigners();
  const deployer = requireSigner(signers, 0, "deployer");
  const inventoryAdmin = requireSigner(signers, 1, "inventory admin");
  const tokenizer = requireSigner(signers, 2, "tokenizer");
  const owner = requireSigner(signers, 3, "owner");
  const other = requireSigner(signers, 4, "other");
  const minter = requireSigner(signers, 5, "minter");
  const burner = requireSigner(signers, 6, "burner");
  const uriSetter = requireSigner(signers, 7, "URI setter");
  const pauser = requireSigner(signers, 8, "pauser");
  const recipient = requireSigner(signers, 9, "recipient");
  const revealer = requireSigner(signers, 10, "revealer");
  const dropAdmin = requireSigner(signers, 11, "drop admin");
  const buyer = requireSigner(signers, 12, "buyer");
  const treasury = requireSigner(signers, 13, "treasury");
  const marketAdmin = requireSigner(signers, 14, "market admin");
  const buybackAdmin = requireSigner(signers, 15, "buyback admin");
  const recipeAdmin = requireSigner(signers, 16, "recipe admin");
  const redemptionAdmin = requireSigner(signers, 17, "redemption admin");
  const registry = (await ethers.deployContract("InventoryRegistry")) as unknown as InventoryRegistry;
  const itemToken = (await ethers.deployContract("ItemToken")) as unknown as ItemToken;
  const randomnessProvider = (await ethers.deployContract(
    "CommitRevealRandomnessProvider"
  )) as unknown as RandomnessProvider;

  await registry.waitForDeployment();
  await itemToken.waitForDeployment();
  await randomnessProvider.waitForDeployment();

  const packSale = (await ethers.deployContract("PackSale", [
    await registry.getAddress(),
    await itemToken.getAddress(),
    await randomnessProvider.getAddress(),
    treasury.address
  ])) as unknown as PackSale;

  await packSale.waitForDeployment();
  const marketplace = (await ethers.deployContract("Marketplace", [
    await itemToken.getAddress(),
    treasury.address
  ])) as unknown as Marketplace;
  const buybackVault = (await ethers.deployContract("BuybackVault", [
    await itemToken.getAddress()
  ])) as unknown as BuybackVault;
  const forge = (await ethers.deployContract("Forge", [
    await itemToken.getAddress(),
    await registry.getAddress(),
    treasury.address
  ])) as unknown as Forge;
  const redemptionRegistry = (await ethers.deployContract("RedemptionRegistry", [
    await itemToken.getAddress(),
    await registry.getAddress()
  ])) as unknown as RedemptionRegistry;

  await marketplace.waitForDeployment();
  await buybackVault.waitForDeployment();
  await forge.waitForDeployment();
  await redemptionRegistry.waitForDeployment();

  await registry.grantRole(await registry.INVENTORY_ADMIN_ROLE(), inventoryAdmin.address);
  await registry.grantRole(await registry.TOKENIZER_ROLE(), tokenizer.address);
  await registry.grantRole(await registry.TOKENIZER_ROLE(), await packSale.getAddress());
  await itemToken.grantRole(await itemToken.MINTER_ROLE(), minter.address);
  await itemToken.grantRole(await itemToken.MINTER_ROLE(), await packSale.getAddress());
  await itemToken.grantRole(await itemToken.MINTER_ROLE(), await forge.getAddress());
  await itemToken.grantRole(await itemToken.BURNER_ROLE(), burner.address);
  await itemToken.grantRole(await itemToken.BURNER_ROLE(), await forge.getAddress());
  await itemToken.grantRole(await itemToken.BURNER_ROLE(), await redemptionRegistry.getAddress());
  await itemToken.grantRole(await itemToken.URI_SETTER_ROLE(), uriSetter.address);
  await itemToken.grantRole(await itemToken.PAUSER_ROLE(), pauser.address);
  await randomnessProvider.grantRole(REQUESTER_ROLE, await packSale.getAddress());
  await randomnessProvider.grantRole(await randomnessProvider.REVEALER_ROLE(), revealer.address);
  await packSale.grantRole(await packSale.DROP_ADMIN_ROLE(), dropAdmin.address);
  await marketplace.grantRole(await marketplace.MARKET_ADMIN_ROLE(), marketAdmin.address);
  await buybackVault.grantRole(await buybackVault.BUYBACK_ADMIN_ROLE(), buybackAdmin.address);
  await forge.grantRole(await forge.RECIPE_ADMIN_ROLE(), recipeAdmin.address);
  await redemptionRegistry.grantRole(
    await redemptionRegistry.REDEMPTION_ADMIN_ROLE(),
    redemptionAdmin.address
  );

  return {
    registry,
    itemToken,
    randomnessProvider,
    packSale,
    marketplace,
    buybackVault,
    forge,
    redemptionRegistry,
    deployer,
    inventoryAdmin,
    tokenizer,
    owner,
    other,
    minter,
    burner,
    uriSetter,
    pauser,
    recipient,
    revealer,
    dropAdmin,
    buyer,
    treasury,
    marketAdmin,
    buybackAdmin,
    recipeAdmin,
    redemptionAdmin
  };
}
