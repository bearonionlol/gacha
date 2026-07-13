import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, network } from "hardhat";
import type { BaseContract, ContractTransactionResponse } from "ethers";
import {
  requireMainnetDeploymentConfig,
  type MainnetDeploymentConfig
} from "./mainnet-deployment-config";
import { requireMainnetRandomnessConfig } from "./mainnet-randomness-config";

type RoleContract = BaseContract & {
  DEFAULT_ADMIN_ROLE(): Promise<string>;
  grantRole(role: string, account: string): Promise<ContractTransactionResponse>;
  hasRole(role: string, account: string): Promise<boolean>;
  renounceRole(role: string, account: string): Promise<ContractTransactionResponse>;
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
  pause(): Promise<ContractTransactionResponse>;
};

type RandomnessProviderContract = RoleContract & {
  REQUESTER_ROLE(): Promise<string>;
  FUND_ADMIN_ROLE?(): Promise<string>;
};

type CommitRevealRandomnessProviderContract = RandomnessProviderContract & {
  REVEALER_ROLE(): Promise<string>;
};

type PackSaleContract = RoleContract & {
  DROP_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  pause(): Promise<ContractTransactionResponse>;
  configureDustRewards(dustLedger: string, dustRewardPolicy: string): Promise<ContractTransactionResponse>;
};

type MarketplaceContract = RoleContract & {
  MARKET_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  pause(): Promise<ContractTransactionResponse>;
};

type BuybackVaultContract = RoleContract & {
  BUYBACK_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  pause(): Promise<ContractTransactionResponse>;
};

type ForgeContract = RoleContract & {
  RECIPE_ADMIN_ROLE(): Promise<string>;
  CRAFT_REVIEWER_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  pause(): Promise<ContractTransactionResponse>;
};

type DustLedgerContract = RoleContract & {
  CREDIT_ROLE(): Promise<string>;
  SPENDER_ROLE(): Promise<string>;
  RESTORER_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  pause(): Promise<ContractTransactionResponse>;
};

type DustRewardPolicyContract = RoleContract & {
  POLICY_ADMIN_ROLE(): Promise<string>;
};

type CollectibleForgePolicyContract = RoleContract & {
  POLICY_ADMIN_ROLE(): Promise<string>;
};

type TradeInVaultContract = RoleContract & {
  CUSTODY_ADMIN_ROLE(): Promise<string>;
  configureForge(forge: string): Promise<ContractTransactionResponse>;
};

type TierPoolContract = RoleContract & {
  POOL_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  pause(): Promise<ContractTransactionResponse>;
  configureForge(forge: string): Promise<ContractTransactionResponse>;
};

type VaultPassportContract = RoleContract & {
  FORGE_ROLE(): Promise<string>;
};

type VaultForgeContract = RoleContract & {
  RECIPE_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  pause(): Promise<ContractTransactionResponse>;
};

type RedemptionRegistryContract = RoleContract & {
  REDEMPTION_ADMIN_ROLE(): Promise<string>;
  PAUSER_ROLE(): Promise<string>;
  pause(): Promise<ContractTransactionResponse>;
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
  DustLedger: string;
  DustRewardPolicy: string;
  CollectibleForgePolicy: string;
  TradeInVault: string;
  TierPool: string;
  VaultPassport: string;
  VaultForge: string;
};

async function deployContract<TContract extends BaseContract>(
  name: string,
  args: unknown[] = [],
  signer?: HardhatEthersSigner
): Promise<TContract> {
  const contract = (await ethers.deployContract(
    name,
    args,
    signer as unknown as Parameters<typeof ethers.deployContract>[2]
  )) as unknown as TContract;
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

async function renounceRole(
  contract: RoleContract,
  role: string,
  account: string,
  label: string
): Promise<void> {
  const tx = await contract.renounceRole(role, account);
  await tx.wait();
  console.log(`renounced ${label} from ${account}`);
}

async function requireContractAccount(address: string, label: string): Promise<void> {
  if ((await ethers.provider.getCode(address)) === "0x") {
    throw new Error(`Mainnet deploy blocked: ${label} must be a deployed contract account`);
  }
}

async function pauseContract(
  contract: BaseContract & { pause(): Promise<ContractTransactionResponse> },
  label: string
): Promise<void> {
  const tx = await contract.pause();
  await tx.wait();
  console.log(`paused ${label}`);
}

async function assertRole(
  contract: RoleContract,
  role: string,
  account: string,
  label: string,
  expected: boolean
): Promise<void> {
  if ((await contract.hasRole(role, account)) !== expected) {
    throw new Error(`Mainnet role handoff verification failed: ${label}`);
  }
}

function deploymentsPath(networkName: string): string {
  return path.resolve(__dirname, "../../../deployments", `${networkName}.json`);
}

async function main(): Promise<void> {
  const [defaultDeployer] = await ethers.getSigners();
  if (!defaultDeployer) {
    throw new Error("No deployer signer is configured");
  }

  const isMainnetForkRehearsal = process.env.GACHA_MAINNET_FORK_REHEARSAL === "true";
  const isProductionDeployment = network.name === "robinhoodMainnet" || isMainnetForkRehearsal;
  const mainnetConfig = isProductionDeployment ? requireMainnetDeploymentConfig() : undefined;
  let deployer: HardhatEthersSigner = defaultDeployer;
  if (isMainnetForkRehearsal && mainnetConfig !== undefined) {
    await network.provider.send("hardhat_impersonateAccount", [mainnetConfig.deployer]);
    await network.provider.send("hardhat_setBalance", [
      mainnetConfig.deployer,
      "0x21e19e0c9bab2400000"
    ]);
    deployer = await ethers.getSigner(mainnetConfig.deployer);
  }

  const deployerAddress = await deployer.getAddress();
  if (mainnetConfig !== undefined && deployerAddress !== mainnetConfig.deployer) {
    throw new Error(
      `Mainnet deploy blocked: configured deployer ${mainnetConfig.deployer} does not match signer ${deployerAddress}`
    );
  }
  if (mainnetConfig !== undefined) {
    await requireContractAccount(mainnetConfig.protocolAdmin, "MAINNET_RELEASE_ADMIN_ADDRESS");
    await requireContractAccount(mainnetConfig.operations, "MAINNET_RELEASE_OPERATIONS_ADDRESS");
    await requireContractAccount(mainnetConfig.guardian, "MAINNET_RELEASE_GUARDIAN_ADDRESS");
    await requireContractAccount(mainnetConfig.treasury, "MAINNET_RELEASE_TREASURY_ADDRESS");
  }
  const productionRandomnessConfig = isProductionDeployment
    ? requireMainnetRandomnessConfig()
    : undefined;
  if (productionRandomnessConfig !== undefined) {
    const coordinatorCode = await ethers.provider.getCode(productionRandomnessConfig.coordinator);
    const actualCodeHash = ethers.keccak256(coordinatorCode).toLowerCase();
    if (
      coordinatorCode === "0x"
      || actualCodeHash !== productionRandomnessConfig.coordinatorCodeHash
    ) {
      throw new Error(
        `Mainnet deploy blocked: randomness coordinator code hash ${actualCodeHash} does not match reviewed ${productionRandomnessConfig.coordinatorCodeHash}`
      );
    }
  }

  const chain = await ethers.provider.getNetwork();
  if (network.name === "robinhoodMainnet" && chain.chainId !== 4_663n) {
    throw new Error(`Mainnet deploy blocked: expected chain ID 4663, received ${chain.chainId}`);
  }
  if (isMainnetForkRehearsal && chain.chainId !== 31_337n) {
    throw new Error(`Mainnet fork rehearsal blocked: expected isolated chain ID 31337, received ${chain.chainId}`);
  }
  console.log(`deploying to ${network.name} (${chain.chainId}) from ${deployerAddress}`);

  const inventoryRegistry = await deployContract<InventoryRegistryContract>("InventoryRegistry", [], deployer);
  const itemToken = await deployContract<ItemTokenContract>("ItemToken", [], deployer);
  let commitRevealRandomnessProvider: CommitRevealRandomnessProviderContract | undefined;
  let randomnessCoordinator: string | undefined;
  let randomnessProviderKind = "commit-reveal-demo";
  let randomnessProvider: RandomnessProviderContract;
  if (productionRandomnessConfig !== undefined) {
    randomnessCoordinator = productionRandomnessConfig.coordinator;
    randomnessProviderKind = "pinned-coordinator";
    randomnessProvider = await deployContract<RandomnessProviderContract>(
      "CoordinatorRandomnessProvider",
      [
        productionRandomnessConfig.coordinator,
        productionRandomnessConfig.coordinatorCodeHash,
        productionRandomnessConfig.maxRequestFee
      ],
      deployer
    );
  } else {
    commitRevealRandomnessProvider = await deployContract<CommitRevealRandomnessProviderContract>(
      "CommitRevealRandomnessProvider",
      [],
      deployer
    );
    randomnessProvider = commitRevealRandomnessProvider;
  }
  const dustLedger = await deployContract<DustLedgerContract>("DustLedger", [], deployer);
  const dustRewardPolicy = await deployContract<DustRewardPolicyContract>("DustRewardPolicy", [], deployer);
  const collectibleForgePolicy = await deployContract<CollectibleForgePolicyContract>(
    "CollectibleForgePolicy",
    [await inventoryRegistry.getAddress()],
    deployer
  );
  const tradeInVault = await deployContract<TradeInVaultContract>("TradeInVault", [
    await itemToken.getAddress()
  ], deployer);
  const tierPool = await deployContract<TierPoolContract>("TierPool", [
    await itemToken.getAddress(),
    await collectibleForgePolicy.getAddress()
  ], deployer);
  const vaultPassport = await deployContract<VaultPassportContract>("VaultPassport", [], deployer);
  const treasuryAddress = mainnetConfig?.treasury ?? deployerAddress;
  const packSale = await deployContract<PackSaleContract>("PackSale", [
    await inventoryRegistry.getAddress(),
    await itemToken.getAddress(),
    await randomnessProvider.getAddress(),
    treasuryAddress
  ], deployer);
  const marketplace = await deployContract<MarketplaceContract>("Marketplace", [
    await itemToken.getAddress(),
    treasuryAddress
  ], deployer);
  const buybackVault = await deployContract<BuybackVaultContract>("BuybackVault", [
    await itemToken.getAddress()
  ], deployer);
  const forge = await deployContract<ForgeContract>("Forge", [
    await itemToken.getAddress(),
    await inventoryRegistry.getAddress(),
    treasuryAddress
  ], deployer);
  const vaultForge = await deployContract<VaultForgeContract>("VaultForge", [
    await itemToken.getAddress(),
    await inventoryRegistry.getAddress(),
    await collectibleForgePolicy.getAddress(),
    await dustLedger.getAddress(),
    await tradeInVault.getAddress(),
    await tierPool.getAddress(),
    await vaultPassport.getAddress(),
    await randomnessProvider.getAddress(),
    treasuryAddress
  ], deployer);
  const redemptionRegistry = await deployContract<RedemptionRegistryContract>(
    "RedemptionRegistry",
    [await itemToken.getAddress(), await inventoryRegistry.getAddress()],
    deployer
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
    await itemToken.MINTER_ROLE(),
    await tierPool.getAddress(),
    "ItemToken.MINTER_ROLE for TierPool custody onboarding"
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
    inventoryRegistry,
    await inventoryRegistry.TOKENIZER_ROLE(),
    await tierPool.getAddress(),
    "InventoryRegistry.TOKENIZER_ROLE for TierPool custody onboarding"
  );
  await grantRole(
    randomnessProvider,
    await randomnessProvider.REQUESTER_ROLE(),
    await packSale.getAddress(),
    "CommitRevealRandomnessProvider.REQUESTER_ROLE for PackSale"
  );
  await grantRole(
    randomnessProvider,
    await randomnessProvider.REQUESTER_ROLE(),
    await vaultForge.getAddress(),
    "CommitRevealRandomnessProvider.REQUESTER_ROLE for VaultForge"
  );
  await grantRole(dustLedger, await dustLedger.CREDIT_ROLE(), await packSale.getAddress(), "DustLedger.CREDIT_ROLE for PackSale");
  await grantRole(dustLedger, await dustLedger.CREDIT_ROLE(), await vaultForge.getAddress(), "DustLedger.CREDIT_ROLE for VaultForge");
  await grantRole(dustLedger, await dustLedger.SPENDER_ROLE(), await vaultForge.getAddress(), "DustLedger.SPENDER_ROLE for VaultForge");
  await grantRole(dustLedger, await dustLedger.RESTORER_ROLE(), await vaultForge.getAddress(), "DustLedger.RESTORER_ROLE for VaultForge");
  await grantRole(vaultPassport, await vaultPassport.FORGE_ROLE(), await vaultForge.getAddress(), "VaultPassport.FORGE_ROLE for VaultForge");
  await (await tradeInVault.configureForge(await vaultForge.getAddress())).wait();
  console.log(`configured TradeInVault for ${await vaultForge.getAddress()}`);
  await (await tierPool.configureForge(await vaultForge.getAddress())).wait();
  console.log(`configured TierPool for ${await vaultForge.getAddress()}`);
  await (await packSale.configureDustRewards(await dustLedger.getAddress(), await dustRewardPolicy.getAddress())).wait();
  console.log("configured PackSale Dust rewards");

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
  if (commitRevealRandomnessProvider !== undefined) {
    await grantRole(
      commitRevealRandomnessProvider,
      await commitRevealRandomnessProvider.REVEALER_ROLE(),
      deployerAddress,
      "CommitRevealRandomnessProvider.REVEALER_ROLE for deployer"
    );
  }
  await grantRole(
    packSale,
    await packSale.DROP_ADMIN_ROLE(),
    deployerAddress,
    "PackSale.DROP_ADMIN_ROLE for deployer"
  );
  await grantRole(packSale, await packSale.PAUSER_ROLE(), deployerAddress, "PackSale.PAUSER_ROLE for deployer");
  await grantRole(
    marketplace,
    await marketplace.MARKET_ADMIN_ROLE(),
    deployerAddress,
    "Marketplace.MARKET_ADMIN_ROLE for deployer"
  );
  await grantRole(marketplace, await marketplace.PAUSER_ROLE(), deployerAddress, "Marketplace.PAUSER_ROLE for deployer");
  await grantRole(
    buybackVault,
    await buybackVault.BUYBACK_ADMIN_ROLE(),
    deployerAddress,
    "BuybackVault.BUYBACK_ADMIN_ROLE for deployer"
  );
  await grantRole(buybackVault, await buybackVault.PAUSER_ROLE(), deployerAddress, "BuybackVault.PAUSER_ROLE for deployer");
  await grantRole(
    forge,
    await forge.RECIPE_ADMIN_ROLE(),
    deployerAddress,
    "Forge.RECIPE_ADMIN_ROLE for deployer"
  );
  await grantRole(forge, await forge.PAUSER_ROLE(), deployerAddress, "Forge.PAUSER_ROLE for deployer");
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
  await grantRole(redemptionRegistry, await redemptionRegistry.PAUSER_ROLE(), deployerAddress, "RedemptionRegistry.PAUSER_ROLE for deployer");
  await grantRole(dustLedger, await dustLedger.PAUSER_ROLE(), deployerAddress, "DustLedger.PAUSER_ROLE for deployer");
  await grantRole(dustRewardPolicy, await dustRewardPolicy.POLICY_ADMIN_ROLE(), deployerAddress, "DustRewardPolicy.POLICY_ADMIN_ROLE for deployer");
  await grantRole(collectibleForgePolicy, await collectibleForgePolicy.POLICY_ADMIN_ROLE(), deployerAddress, "CollectibleForgePolicy.POLICY_ADMIN_ROLE for deployer");
  await grantRole(tradeInVault, await tradeInVault.CUSTODY_ADMIN_ROLE(), deployerAddress, "TradeInVault.CUSTODY_ADMIN_ROLE for deployer");
  await grantRole(tierPool, await tierPool.POOL_ADMIN_ROLE(), deployerAddress, "TierPool.POOL_ADMIN_ROLE for deployer");
  await grantRole(tierPool, await tierPool.PAUSER_ROLE(), deployerAddress, "TierPool.PAUSER_ROLE for deployer");
  await grantRole(vaultForge, await vaultForge.RECIPE_ADMIN_ROLE(), deployerAddress, "VaultForge.RECIPE_ADMIN_ROLE for deployer");
  await grantRole(vaultForge, await vaultForge.PAUSER_ROLE(), deployerAddress, "VaultForge.PAUSER_ROLE for deployer");

  let launchState: "active" | "paused" = "active";
  if (mainnetConfig !== undefined) {
    const operationalAssignments: Array<{
      contract: RoleContract;
      role: string;
      label: string;
    }> = [
      { contract: inventoryRegistry, role: await inventoryRegistry.INVENTORY_ADMIN_ROLE(), label: "InventoryRegistry.INVENTORY_ADMIN_ROLE" },
      { contract: itemToken, role: await itemToken.URI_SETTER_ROLE(), label: "ItemToken.URI_SETTER_ROLE" },
      { contract: packSale, role: await packSale.DROP_ADMIN_ROLE(), label: "PackSale.DROP_ADMIN_ROLE" },
      { contract: marketplace, role: await marketplace.MARKET_ADMIN_ROLE(), label: "Marketplace.MARKET_ADMIN_ROLE" },
      { contract: buybackVault, role: await buybackVault.BUYBACK_ADMIN_ROLE(), label: "BuybackVault.BUYBACK_ADMIN_ROLE" },
      { contract: forge, role: await forge.RECIPE_ADMIN_ROLE(), label: "Forge.RECIPE_ADMIN_ROLE" },
      { contract: forge, role: await forge.CRAFT_REVIEWER_ROLE(), label: "Forge.CRAFT_REVIEWER_ROLE" },
      { contract: redemptionRegistry, role: await redemptionRegistry.REDEMPTION_ADMIN_ROLE(), label: "RedemptionRegistry.REDEMPTION_ADMIN_ROLE" },
      { contract: dustRewardPolicy, role: await dustRewardPolicy.POLICY_ADMIN_ROLE(), label: "DustRewardPolicy.POLICY_ADMIN_ROLE" },
      { contract: collectibleForgePolicy, role: await collectibleForgePolicy.POLICY_ADMIN_ROLE(), label: "CollectibleForgePolicy.POLICY_ADMIN_ROLE" },
      { contract: tradeInVault, role: await tradeInVault.CUSTODY_ADMIN_ROLE(), label: "TradeInVault.CUSTODY_ADMIN_ROLE" },
      { contract: tierPool, role: await tierPool.POOL_ADMIN_ROLE(), label: "TierPool.POOL_ADMIN_ROLE" },
      { contract: vaultForge, role: await vaultForge.RECIPE_ADMIN_ROLE(), label: "VaultForge.RECIPE_ADMIN_ROLE" }
    ];
    if (randomnessProvider.FUND_ADMIN_ROLE === undefined) {
      throw new Error("Mainnet deploy blocked: production randomness provider has no FUND_ADMIN_ROLE");
    }
    operationalAssignments.push({
      contract: randomnessProvider,
      role: await randomnessProvider.FUND_ADMIN_ROLE(),
      label: "CoordinatorRandomnessProvider.FUND_ADMIN_ROLE"
    });

    const guardianAssignments: Array<{
      contract: RoleContract;
      role: string;
      label: string;
    }> = [
      { contract: itemToken, role: await itemToken.PAUSER_ROLE(), label: "ItemToken.PAUSER_ROLE" },
      { contract: packSale, role: await packSale.PAUSER_ROLE(), label: "PackSale.PAUSER_ROLE" },
      { contract: marketplace, role: await marketplace.PAUSER_ROLE(), label: "Marketplace.PAUSER_ROLE" },
      { contract: buybackVault, role: await buybackVault.PAUSER_ROLE(), label: "BuybackVault.PAUSER_ROLE" },
      { contract: forge, role: await forge.PAUSER_ROLE(), label: "Forge.PAUSER_ROLE" },
      { contract: redemptionRegistry, role: await redemptionRegistry.PAUSER_ROLE(), label: "RedemptionRegistry.PAUSER_ROLE" },
      { contract: dustLedger, role: await dustLedger.PAUSER_ROLE(), label: "DustLedger.PAUSER_ROLE" },
      { contract: tierPool, role: await tierPool.PAUSER_ROLE(), label: "TierPool.PAUSER_ROLE" },
      { contract: vaultForge, role: await vaultForge.PAUSER_ROLE(), label: "VaultForge.PAUSER_ROLE" }
    ];

    for (const assignment of operationalAssignments) {
      await grantRole(assignment.contract, assignment.role, mainnetConfig.operations, `${assignment.label} for operations`);
    }
    for (const assignment of guardianAssignments) {
      await grantRole(assignment.contract, assignment.role, mainnetConfig.guardian, `${assignment.label} for guardian`);
    }

    await pauseContract(packSale, "PackSale");
    await pauseContract(marketplace, "Marketplace");
    await pauseContract(buybackVault, "BuybackVault");
    await pauseContract(forge, "Forge");
    await pauseContract(redemptionRegistry, "RedemptionRegistry intake");
    await pauseContract(dustLedger, "DustLedger");
    await pauseContract(tierPool, "TierPool");
    await pauseContract(vaultForge, "VaultForge");
    await pauseContract(itemToken, "ItemToken");
    launchState = "paused";

    const administeredContracts: Array<{ contract: RoleContract; label: string }> = [
      { contract: inventoryRegistry, label: "InventoryRegistry" },
      { contract: itemToken, label: "ItemToken" },
      { contract: randomnessProvider, label: "CoordinatorRandomnessProvider" },
      { contract: packSale, label: "PackSale" },
      { contract: marketplace, label: "Marketplace" },
      { contract: buybackVault, label: "BuybackVault" },
      { contract: forge, label: "Forge" },
      { contract: redemptionRegistry, label: "RedemptionRegistry" },
      { contract: dustLedger, label: "DustLedger" },
      { contract: dustRewardPolicy, label: "DustRewardPolicy" },
      { contract: collectibleForgePolicy, label: "CollectibleForgePolicy" },
      { contract: tradeInVault, label: "TradeInVault" },
      { contract: tierPool, label: "TierPool" },
      { contract: vaultPassport, label: "VaultPassport" },
      { contract: vaultForge, label: "VaultForge" }
    ];

    for (const administered of administeredContracts) {
      await grantRole(
        administered.contract,
        await administered.contract.DEFAULT_ADMIN_ROLE(),
        mainnetConfig.protocolAdmin,
        `${administered.label}.DEFAULT_ADMIN_ROLE for protocol admin`
      );
    }

    for (const assignment of [...operationalAssignments, ...guardianAssignments]) {
      await renounceRole(assignment.contract, assignment.role, deployerAddress, assignment.label);
    }
    for (const administered of administeredContracts) {
      const defaultAdminRole = await administered.contract.DEFAULT_ADMIN_ROLE();
      await renounceRole(administered.contract, defaultAdminRole, deployerAddress, `${administered.label}.DEFAULT_ADMIN_ROLE`);
      await assertRole(
        administered.contract,
        defaultAdminRole,
        mainnetConfig.protocolAdmin,
        `${administered.label} protocol admin`,
        true
      );
      await assertRole(
        administered.contract,
        defaultAdminRole,
        deployerAddress,
        `${administered.label} deployer admin removal`,
        false
      );
    }
    for (const assignment of operationalAssignments) {
      await assertRole(assignment.contract, assignment.role, mainnetConfig.operations, assignment.label, true);
      await assertRole(assignment.contract, assignment.role, deployerAddress, `${assignment.label} deployer removal`, false);
    }
    for (const assignment of guardianAssignments) {
      await assertRole(assignment.contract, assignment.role, mainnetConfig.guardian, assignment.label, true);
      await assertRole(assignment.contract, assignment.role, deployerAddress, `${assignment.label} deployer removal`, false);
    }
  }

  const addresses: DeploymentAddresses = {
    InventoryRegistry: await inventoryRegistry.getAddress(),
    ItemToken: await itemToken.getAddress(),
    CommitRevealRandomnessProvider: await randomnessProvider.getAddress(),
    PackSale: await packSale.getAddress(),
    Marketplace: await marketplace.getAddress(),
    BuybackVault: await buybackVault.getAddress(),
    Forge: await forge.getAddress(),
    RedemptionRegistry: await redemptionRegistry.getAddress(),
    DustLedger: await dustLedger.getAddress(),
    DustRewardPolicy: await dustRewardPolicy.getAddress(),
    CollectibleForgePolicy: await collectibleForgePolicy.getAddress(),
    TradeInVault: await tradeInVault.getAddress(),
    TierPool: await tierPool.getAddress(),
    VaultPassport: await vaultPassport.getAddress(),
    VaultForge: await vaultForge.getAddress()
  };

  const deployment = {
    network: network.name,
    chainId: Number(chain.chainId),
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    randomnessProviderKind,
    randomnessCoordinator,
    launchState,
    ...(mainnetConfig === undefined ? {} : {
      roleHolders: {
        protocolAdmin: mainnetConfig.protocolAdmin,
        operations: mainnetConfig.operations,
        guardian: mainnetConfig.guardian,
        treasury: mainnetConfig.treasury
      }
    }),
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
