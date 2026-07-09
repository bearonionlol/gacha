import {
  ROBINHOOD_CHAIN_MAINNET_ID,
  ROBINHOOD_CHAIN_TESTNET_ID,
  robinhoodChain,
  robinhoodChainTestnet
} from "@gacha/shared";

export type DeploymentRegistrySnapshot = {
  network: string;
  chainId: number;
  deployedAt?: string;
  timestamp?: string;
  contracts?: Record<string, string>;
};

export type DeploymentReadiness = "demo" | "ready" | "incomplete";

export type DeploymentStatus = {
  mode: "demo" | "testnet" | "mainnet";
  readiness: DeploymentReadiness;
  chainName: string;
  chainId: number;
  message: string;
  contracts: { name: string; address: string }[];
};

export const requiredProtocolContracts = [
  "InventoryRegistry",
  "ItemToken",
  "CommitRevealRandomnessProvider",
  "PackSale",
  "Marketplace",
  "BuybackVault",
  "Forge",
  "RedemptionRegistry"
] as const;

export const requiredVaultForgeContracts = [
  "DustLedger",
  "DustRewardPolicy",
  "CollectibleForgePolicy",
  "TradeInVault",
  "TierPool",
  "VaultPassport",
  "VaultForge"
] as const;

export const requiredDeploymentContracts = [
  ...requiredProtocolContracts,
  ...requiredVaultForgeContracts
] as const;

type DeploymentRegistryEnv = Record<string, string | undefined>;

const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/;

function isDeploymentRegistrySnapshot(value: unknown): value is DeploymentRegistrySnapshot {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<DeploymentRegistrySnapshot>;
  return typeof snapshot.network === "string" && typeof snapshot.chainId === "number";
}

export function loadDeploymentRegistrySnapshotFromEnv(
  env: DeploymentRegistryEnv = process.env
): DeploymentRegistrySnapshot | null {
  const rawRegistry = env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY;
  if (rawRegistry === undefined || rawRegistry.trim() === "" || rawRegistry === "demo") {
    return null;
  }

  try {
    const parsed = JSON.parse(rawRegistry) as unknown;
    return isDeploymentRegistrySnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveDeploymentStatus(snapshot: DeploymentRegistrySnapshot | null): DeploymentStatus {
  if (snapshot === null) {
    return {
      mode: "demo",
      readiness: "demo",
      chainName: robinhoodChainTestnet.name,
      chainId: robinhoodChainTestnet.id,
      message: "Demo mode is using deterministic local app state until a deployment registry is present.",
      contracts: []
    };
  }

  const contracts = Object.entries(snapshot.contracts ?? {}).map(([name, address]) => ({ name, address }));
  const timestamp = snapshot.deployedAt ?? snapshot.timestamp;
  const deployedAt = timestamp === undefined ? "from the local registry" : `at ${timestamp}`;
  const knownChain =
    snapshot.chainId === ROBINHOOD_CHAIN_MAINNET_ID || snapshot.chainId === ROBINHOOD_CHAIN_TESTNET_ID;

  if (!knownChain) {
    return {
      mode: "demo",
      readiness: "demo",
      chainName: "Unsupported chain",
      chainId: snapshot.chainId,
      message: `${snapshot.network} registry loaded ${deployedAt}, but chain ${snapshot.chainId} is an unsupported chain for this app build.`,
      contracts
    };
  }

  const chainName = snapshot.chainId === ROBINHOOD_CHAIN_MAINNET_ID ? robinhoodChain.name : robinhoodChainTestnet.name;
  const mode = snapshot.chainId === ROBINHOOD_CHAIN_MAINNET_ID ? "mainnet" : "testnet";
  const missingContracts = requiredDeploymentContracts.filter((name) => snapshot.contracts?.[name] === undefined);
  const invalidContracts = contracts
    .filter(({ address }) => !evmAddressPattern.test(address))
    .map(({ name }) => name);

  if (missingContracts.length > 0) {
    return {
      mode,
      readiness: "incomplete",
      chainName,
      chainId: snapshot.chainId,
      message: `${snapshot.network} registry loaded ${deployedAt}, but it is missing required contracts: ${missingContracts.join(", ")}.`,
      contracts
    };
  }

  if (invalidContracts.length > 0) {
    return {
      mode,
      readiness: "incomplete",
      chainName,
      chainId: snapshot.chainId,
      message: `${snapshot.network} registry loaded ${deployedAt}, but it has invalid contract addresses for: ${invalidContracts.join(", ")}.`,
      contracts
    };
  }

  return {
    mode,
    readiness: "ready",
    chainName,
    chainId: snapshot.chainId,
    message: `${snapshot.network} deployment registry loaded ${deployedAt}.`,
    contracts
  };
}
