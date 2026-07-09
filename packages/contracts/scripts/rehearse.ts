import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";
import type {
  BaseContract,
  BigNumberish,
  ContractTransactionResponse,
  TransactionResponse,
  TransactionReceipt
} from "ethers";

type DeploymentFile = {
  chainId: number;
  deployer: string;
  timestamp: string;
  contracts: Record<string, string>;
};

type InventoryRegistryContract = BaseContract & {
  derivePhysicalTokenId(inventoryId: string): Promise<bigint>;
};

type ItemTokenContract = BaseContract & {
  balanceOf(account: string, tokenId: BigNumberish): Promise<bigint>;
  isApprovedForAll(owner: string, operator: string): Promise<boolean>;
  setApprovalForAll(operator: string, approved: boolean): Promise<ContractTransactionResponse>;
};

type PackSaleContract = BaseContract & {
  nextPurchaseId(): Promise<bigint>;
  purchase(dropId: BigNumberish, overrides: { value: BigNumberish }): Promise<ContractTransactionResponse>;
  reveal(purchaseId: BigNumberish): Promise<ContractTransactionResponse>;
  treasuryCredit(): Promise<bigint>;
};

type DustLedgerContract = BaseContract & {
  balancesOf(account: string): Promise<readonly bigint[]>;
};

type RandomnessProviderContract = BaseContract & {
  commitRandomness(requestId: string, commitment: string): Promise<ContractTransactionResponse>;
  revealRandomness(requestId: string, seed: string): Promise<ContractTransactionResponse>;
};

type ForgeContract = BaseContract & {
  craftWithImprint(
    recipeId: BigNumberish,
    imprintHash: string,
    overrides?: { value: BigNumberish }
  ): Promise<ContractTransactionResponse>;
  treasuryFeesCredit(account: string): Promise<bigint>;
};

type MarketplaceContract = BaseContract & {
  feeBps(): Promise<bigint>;
  nextListingId(): Promise<bigint>;
  list(
    tokenId: BigNumberish,
    amount: BigNumberish,
    price: BigNumberish
  ): Promise<ContractTransactionResponse>;
  buy(listingId: BigNumberish, overrides: { value: BigNumberish }): Promise<ContractTransactionResponse>;
  proceedsCredit(account: string): Promise<bigint>;
  withdrawProceeds(): Promise<ContractTransactionResponse>;
};

type BuybackVaultContract = BaseContract & {
  quotes(tokenId: BigNumberish): Promise<readonly [bigint, boolean] & { price: bigint; active: boolean }>;
  totalPayoutCredit(): Promise<bigint>;
  acceptQuote(tokenId: BigNumberish, amount: BigNumberish): Promise<ContractTransactionResponse>;
  payoutCredit(account: string): Promise<bigint>;
  withdrawPayout(): Promise<ContractTransactionResponse>;
  withdrawToken(
    to: string,
    tokenId: BigNumberish,
    amount: BigNumberish
  ): Promise<ContractTransactionResponse>;
};

type RedemptionRegistryContract = BaseContract & {
  nextRequestId(): Promise<bigint>;
  requestRedemption(tokenId: BigNumberish): Promise<ContractTransactionResponse>;
  cancel(requestId: BigNumberish, reason: string): Promise<ContractTransactionResponse>;
};

type NativeTransactionSender = {
  sendTransaction(transaction: {
    to: string;
    value: BigNumberish;
  }): Promise<TransactionResponse>;
};

const sampleInventoryId = "inv-sample-graded-001";
const fireShardTokenId = 7_001n;
const vaultSealTokenId = 7_002n;
const forgeDustTokenId = 7_003n;
const resonanceDustTokenId = 7_004n;
const signalBadgeTokenId = 9_001n;
const resonanceAuraTokenId = 9_002n;
const curatorSigilTokenId = 9_003n;
const packPrice = ethers.parseEther("0.01");
const signalFee = ethers.parseEther("0.001");
const resonanceFee = ethers.parseEther("0.002");
const curatorSigilFee = ethers.parseEther("0.001");
const marketAsk = ethers.parseEther("0.012");
const expectedMarketFeeBps = 250n;
const rehearsalGasReserve = ethers.parseEther("0.005");

function deploymentPath(): string {
  return path.resolve(__dirname, "../../../deployments", `${network.name}.json`);
}

function loadDeployment(): DeploymentFile {
  const filePath = deploymentPath();
  if (!existsSync(filePath)) {
    throw new Error(`Missing deployment file: ${filePath}`);
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as DeploymentFile;
}

function contractAddress(deployment: DeploymentFile, name: string): string {
  const address = deployment.contracts[name];
  if (!address || !ethers.isAddress(address)) {
    throw new Error(`Missing or invalid ${name} address in deployment registry`);
  }
  return address;
}

async function submit(
  label: string,
  transaction: Promise<ContractTransactionResponse>
): Promise<TransactionReceipt> {
  const response = await transaction;
  console.log(`${label}: ${response.hash}`);
  const receipt = await response.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`${label} did not confirm successfully`);
  }
  return receipt;
}

async function ensureApproval(
  itemToken: ItemTokenContract,
  owner: string,
  operator: string,
  label: string
): Promise<void> {
  if (await itemToken.isApprovedForAll(owner, operator)) {
    return;
  }
  await submit(`${label} approval`, itemToken.setApprovalForAll(operator, true));
}

function requestIdFor(
  packSaleAddress: string,
  purchaseId: bigint,
  buyer: string,
  chainId: bigint
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "address", "uint256"],
      [packSaleAddress, purchaseId, buyer, chainId]
    )
  );
}

function randomnessCommitment(seed: string): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [seed])
  );
}

async function restoreBuybackLiquidity(
  buybackVault: BuybackVaultContract,
  deployer: NativeTransactionSender,
  quotePrice: bigint
): Promise<void> {
  const vaultAddress = await buybackVault.getAddress();
  const balance = await ethers.provider.getBalance(vaultAddress);
  const payoutCredit = await buybackVault.totalPayoutCredit();
  if (balance < payoutCredit) {
    throw new Error("BuybackVault balance fell below reserved payout credit");
  }

  const available = balance - payoutCredit;
  if (available >= quotePrice) {
    return;
  }

  const response = await deployer.sendTransaction({ to: vaultAddress, value: quotePrice - available });
  console.log(`restore buyback liquidity: ${response.hash}`);
  const receipt = await response.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Buyback liquidity restore did not confirm successfully");
  }
}

async function main(): Promise<void> {
  if (network.name === "robinhoodMainnet") {
    throw new Error("Automated collector rehearsal is permanently blocked on mainnet");
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer is configured");
  }

  const deployment = loadDeployment();
  const chain = await ethers.provider.getNetwork();
  if (deployment.chainId !== Number(chain.chainId)) {
    throw new Error(
      `Deployment chain ${deployment.chainId} does not match provider chain ${chain.chainId}`
    );
  }

  const account = await deployer.getAddress();
  if (account.toLowerCase() !== deployment.deployer.toLowerCase()) {
    throw new Error("Configured signer does not match the deployment registry deployer");
  }

  const inventoryRegistry = (await ethers.getContractAt(
    "InventoryRegistry",
    contractAddress(deployment, "InventoryRegistry")
  )) as unknown as InventoryRegistryContract;
  const itemToken = (await ethers.getContractAt(
    "ItemToken",
    contractAddress(deployment, "ItemToken")
  )) as unknown as ItemTokenContract;
  const randomnessProvider = (await ethers.getContractAt(
    "CommitRevealRandomnessProvider",
    contractAddress(deployment, "CommitRevealRandomnessProvider")
  )) as unknown as RandomnessProviderContract;
  const packSale = (await ethers.getContractAt(
    "PackSale",
    contractAddress(deployment, "PackSale")
  )) as unknown as PackSaleContract;
  const dustLedger = (await ethers.getContractAt(
    "DustLedger",
    contractAddress(deployment, "DustLedger")
  )) as unknown as DustLedgerContract;
  const forge = (await ethers.getContractAt(
    "Forge",
    contractAddress(deployment, "Forge")
  )) as unknown as ForgeContract;
  const marketplace = (await ethers.getContractAt(
    "Marketplace",
    contractAddress(deployment, "Marketplace")
  )) as unknown as MarketplaceContract;
  const buybackVault = (await ethers.getContractAt(
    "BuybackVault",
    contractAddress(deployment, "BuybackVault")
  )) as unknown as BuybackVaultContract;
  const redemptionRegistry = (await ethers.getContractAt(
    "RedemptionRegistry",
    contractAddress(deployment, "RedemptionRegistry")
  )) as unknown as RedemptionRegistryContract;

  const purchaseId = await packSale.nextPurchaseId();
  if (purchaseId !== 1n) {
    throw new Error(
      `Rehearsal is one-shot and requires a fresh seeded deployment; next purchase is ${purchaseId}`
    );
  }
  if ((await marketplace.feeBps()) !== expectedMarketFeeBps) {
    throw new Error(`Marketplace fee is not the reviewed ${expectedMarketFeeBps} bps`);
  }

  const physicalTokenId = await inventoryRegistry.derivePhysicalTokenId(sampleInventoryId);
  const quote = await buybackVault.quotes(physicalTokenId);
  if (!quote.active || quote.price === 0n) {
    throw new Error("Seeded physical card does not have an active buyback quote");
  }

  const deployerBalance = await ethers.provider.getBalance(account);
  const minimumWorkingBalance =
    packPrice + signalFee * 2n + resonanceFee + curatorSigilFee + marketAsk + rehearsalGasReserve;
  if (deployerBalance < minimumWorkingBalance) {
    throw new Error(
      `Insufficient deployer testnet ETH for rehearsal: have ${ethers.formatEther(deployerBalance)} ETH, need at least ${ethers.formatEther(minimumWorkingBalance)} ETH including gas reserve`
    );
  }

  await submit("purchase pack", packSale.purchase(1n, { value: packPrice }));
  const requestId = requestIdFor(await packSale.getAddress(), purchaseId, account, chain.chainId);
  const randomnessSeed = ethers.id(
    `testnet-rehearsal:${deployment.timestamp}:${await packSale.getAddress()}`
  );
  await submit(
    "commit reveal seed",
    randomnessProvider.commitRandomness(requestId, randomnessCommitment(randomnessSeed))
  );
  await submit("reveal seed", randomnessProvider.revealRandomness(requestId, randomnessSeed));
  await submit("reveal pack", packSale.reveal(purchaseId));

  const dustBalances = await dustLedger.balancesOf(account);
  const specialtyDust = dustBalances[1]! + dustBalances[2]! + dustBalances[3]!;
  if (
    dustBalances[0] !== 100n || specialtyDust !== 20n
      || dustBalances.slice(1).some((amount) => amount % 10n !== 0n)
  ) {
    throw new Error("Pack reveal did not credit the reviewed Magic and specialty Dust policy");
  }

  if (
    (await itemToken.balanceOf(account, physicalTokenId)) !== 1n
      || (await itemToken.balanceOf(account, fireShardTokenId)) < 6n
      || (await itemToken.balanceOf(account, vaultSealTokenId)) < 2n
  ) {
    throw new Error("Pack reveal and seeded Forge reserve did not provide the two required starter bundles");
  }

  await ensureApproval(itemToken, account, await forge.getAddress(), "Forge");
  const imprintBase = `${deployment.timestamp}:${account}`;
  await submit("craft duplicate recycler", forge.craftWithImprint(1n, ethers.id(`recycler:${imprintBase}`)));
  if ((await itemToken.balanceOf(account, forgeDustTokenId)) < 1n) {
    throw new Error("Duplicate recycler did not mint Forge dust");
  }
  await submit(
    "craft Fire Signal",
    forge.craftWithImprint(2n, ethers.id(`signal:${imprintBase}`), { value: signalFee })
  );
  if ((await itemToken.balanceOf(account, signalBadgeTokenId)) < 1n) {
    throw new Error("Fire Signal craft did not mint the badge");
  }
  await submit(
    "craft Vault Resonance",
    forge.craftWithImprint(3n, ethers.id(`resonance:${imprintBase}`), { value: resonanceFee })
  );
  if (
    (await itemToken.balanceOf(account, resonanceAuraTokenId)) < 1n
      || (await itemToken.balanceOf(account, physicalTokenId)) !== 1n
  ) {
    throw new Error("Vault Resonance failed or consumed its protected physical catalyst");
  }
  await submit("craft second duplicate recycler", forge.craftWithImprint(1n, ethers.id(`recycler-refine:${imprintBase}`)));
  await submit(
    "craft second Fire Signal",
    forge.craftWithImprint(2n, ethers.id(`signal-refine:${imprintBase}`), { value: signalFee })
  );
  await submit(
    "refine Signal badge",
    forge.craftWithImprint(4n, ethers.id(`refinery:${imprintBase}`))
  );
  if ((await itemToken.balanceOf(account, resonanceDustTokenId)) < 1n) {
    throw new Error("Resonant Refinery did not mint Resonance dust");
  }
  await submit(
    "craft Curator Sigil",
    forge.craftWithImprint(5n, ethers.id(`sigil:${imprintBase}`), { value: curatorSigilFee })
  );
  if (
    (await itemToken.balanceOf(account, resonanceDustTokenId)) !== 0n
      || (await itemToken.balanceOf(account, curatorSigilTokenId)) !== 1n
      || (await itemToken.balanceOf(account, resonanceAuraTokenId)) !== 1n
      || (await itemToken.balanceOf(account, physicalTokenId)) !== 1n
  ) {
    throw new Error("Curator Sigil did not consume only its reagent and retain both catalysts");
  }

  await ensureApproval(itemToken, account, await marketplace.getAddress(), "Marketplace");
  const listingId = await marketplace.nextListingId();
  await submit("list physical card", marketplace.list(physicalTokenId, 1n, marketAsk));
  await submit("settle market rehearsal", marketplace.buy(listingId, { value: marketAsk }));
  const marketCredit = await marketplace.proceedsCredit(account);
  if (marketCredit !== marketAsk) {
    throw new Error(`Marketplace settlement credit expected ${marketAsk}, got ${marketCredit}`);
  }
  await submit("withdraw market proceeds", marketplace.withdrawProceeds());

  await ensureApproval(
    itemToken,
    account,
    await redemptionRegistry.getAddress(),
    "RedemptionRegistry"
  );
  const redemptionId = await redemptionRegistry.nextRequestId();
  await submit("request redemption", redemptionRegistry.requestRedemption(physicalTokenId));
  await submit(
    "cancel rehearsal redemption",
    redemptionRegistry.cancel(redemptionId, "Automated testnet custody rehearsal")
  );

  await ensureApproval(itemToken, account, await buybackVault.getAddress(), "BuybackVault");
  await submit("accept buyback quote", buybackVault.acceptQuote(physicalTokenId, 1n));
  if ((await buybackVault.payoutCredit(account)) !== quote.price) {
    throw new Error("Buyback payout credit does not match the published quote");
  }
  await submit("withdraw buyback payout", buybackVault.withdrawPayout());
  await submit(
    "return rehearsal inventory",
    buybackVault.withdrawToken(account, physicalTokenId, 1n)
  );
  await restoreBuybackLiquidity(buybackVault, deployer, quote.price);

  const packRevenue = await packSale.treasuryCredit();
  const forgeRevenue = await forge.treasuryFeesCredit(account);
  const marketFee = (marketAsk * expectedMarketFeeBps) / 10_000n;
  if (packRevenue !== packPrice || forgeRevenue !== signalFee * 2n + resonanceFee + curatorSigilFee) {
    throw new Error("Protocol revenue credits do not match the disclosed pack and Forge fees");
  }
  if (
    (await itemToken.balanceOf(account, physicalTokenId)) !== 1n
      || (await itemToken.balanceOf(account, resonanceAuraTokenId)) !== 1n
      || (await itemToken.balanceOf(account, curatorSigilTokenId)) !== 1n
  ) {
    throw new Error("Rehearsal did not restore the collectible and crafted output to the operator wallet");
  }

  console.log(
    `rehearsal passed: pack ${ethers.formatEther(packRevenue)} ETH, Forge ${ethers.formatEther(forgeRevenue)} ETH, market fee path ${ethers.formatEther(marketFee)} ETH`
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
