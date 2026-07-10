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

export type DeploymentContractDiagnostic = {
  address: string | null;
  group: "base" | "vault_forge";
  name: (typeof requiredDeploymentContracts)[number];
  status: "duplicate" | "invalid" | "missing" | "ready";
};

export type DeploymentDiagnostics = {
  baseReady: boolean;
  baseReadyCount: number;
  contracts: DeploymentContractDiagnostic[];
  fullStackReady: boolean;
  targetChainReady: boolean;
  timestamp: string | null;
  totalReadyCount: number;
  vaultForgeReady: boolean;
  vaultForgeReadyCount: number;
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
const zeroAddressPattern = /^0x0{40}$/i;

function isDeploymentAddress(value: string): boolean {
  return evmAddressPattern.test(value) && !zeroAddressPattern.test(value);
}

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
    .filter(({ address }) => !isDeploymentAddress(address))
    .map(({ name }) => name);
  const addressCounts = countDeploymentAddresses(snapshot);
  const duplicateContracts = requiredDeploymentContracts.filter((name) => {
    const address = snapshot.contracts?.[name];
    return typeof address === "string" && isDeploymentAddress(address) && addressCounts.get(address.toLowerCase())! > 1;
  });

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

  if (duplicateContracts.length > 0) {
    return {
      mode,
      readiness: "incomplete",
      chainName,
      chainId: snapshot.chainId,
      message: `${snapshot.network} registry loaded ${deployedAt}, but contract addresses are reused by: ${duplicateContracts.join(", ")}.`,
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

export function getDeploymentDiagnostics(
  snapshot: DeploymentRegistrySnapshot | null
): DeploymentDiagnostics {
  const addressCounts = countDeploymentAddresses(snapshot);
  const contracts = requiredDeploymentContracts.map((name) => {
    const address = snapshot?.contracts?.[name] ?? null;
    const group = requiredProtocolContracts.includes(name as (typeof requiredProtocolContracts)[number])
      ? "base"
      : "vault_forge";

    return {
      address,
      group,
      name,
      status:
        address === null
          ? "missing"
          : !isDeploymentAddress(address)
            ? "invalid"
            : addressCounts.get(address.toLowerCase())! > 1
              ? "duplicate"
              : "ready"
    } satisfies DeploymentContractDiagnostic;
  });

  const baseReadyCount = contracts.filter(
    (contract) => contract.group === "base" && contract.status === "ready"
  ).length;
  const vaultForgeReadyCount = contracts.filter(
    (contract) => contract.group === "vault_forge" && contract.status === "ready"
  ).length;
  const totalReadyCount = baseReadyCount + vaultForgeReadyCount;
  const targetChainReady = snapshot?.chainId === ROBINHOOD_CHAIN_TESTNET_ID;

  return {
    baseReady: targetChainReady && baseReadyCount === requiredProtocolContracts.length,
    baseReadyCount,
    contracts,
    fullStackReady: targetChainReady && totalReadyCount === requiredDeploymentContracts.length,
    targetChainReady,
    timestamp: snapshot?.deployedAt ?? snapshot?.timestamp ?? null,
    totalReadyCount,
    vaultForgeReady: targetChainReady && vaultForgeReadyCount === requiredVaultForgeContracts.length,
    vaultForgeReadyCount
  };
}

function countDeploymentAddresses(snapshot: DeploymentRegistrySnapshot | null): Map<string, number> {
  const counts = new Map<string, number>();

  for (const name of requiredDeploymentContracts) {
    const address = snapshot?.contracts?.[name];
    if (typeof address !== "string" || !isDeploymentAddress(address)) continue;
    const normalized = address.toLowerCase();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return counts;
}
