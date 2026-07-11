import {
  ROBINHOOD_CHAIN_MAINNET_ID,
  ROBINHOOD_CHAIN_TESTNET_ID,
  robinhoodChain,
  robinhoodChainTestnet
} from "@gacha/shared";
import type { Chain } from "viem";

export type DeploymentRegistrySnapshot = {
  network: string;
  chainId: number;
  deployedAt?: string;
  timestamp?: string;
  launchState?: string;
  randomnessProviderKind?: string;
  randomnessCoordinator?: string;
  roleHolders?: {
    protocolAdmin?: string;
    operations?: string;
    guardian?: string;
    treasury?: string;
  };
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

export type ChainContext = {
  chain: Chain;
  chainId: number;
  chainName: string;
  disclosure: string;
  environmentLabel: "Demo" | "Testnet" | "Mainnet";
  explorerName: string;
  explorerUrl: string;
  isDemo: boolean;
  isMainnet: boolean;
  launchState: string | null;
  mode: DeploymentStatus["mode"];
  nativeCurrencySymbol: string;
  productionRandomnessReady: boolean;
  randomnessProviderKind: string | null;
  productionRolesReady: boolean;
  readiness: DeploymentReadiness;
  statusMessage: string;
  switchLabel: string;
  transactionLabel: string;
  writeBlockReason: string | null;
  writesEnabled: boolean;
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

function readPublicDeploymentEnv(): DeploymentRegistryEnv {
  return {
    NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY
  };
}

function isDeploymentAddress(value: string): boolean {
  return evmAddressPattern.test(value) && !zeroAddressPattern.test(value);
}

function hasProductionRandomnessMetadata(snapshot: DeploymentRegistrySnapshot | null): boolean {
  return snapshot?.randomnessProviderKind === "pinned-coordinator" &&
    typeof snapshot.randomnessCoordinator === "string" &&
    isDeploymentAddress(snapshot.randomnessCoordinator);
}

function hasProductionRoleMetadata(snapshot: DeploymentRegistrySnapshot | null): boolean {
  const roles = snapshot?.roleHolders;
  return roles !== undefined && [roles.protocolAdmin, roles.operations, roles.guardian, roles.treasury]
    .every((address) => typeof address === "string" && isDeploymentAddress(address));
}

function isDeploymentRegistrySnapshot(value: unknown): value is DeploymentRegistrySnapshot {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<DeploymentRegistrySnapshot>;
  return typeof snapshot.network === "string" && typeof snapshot.chainId === "number";
}

export function loadDeploymentRegistrySnapshotFromEnv(
  env?: DeploymentRegistryEnv
): DeploymentRegistrySnapshot | null {
  const rawRegistry = (env ?? readPublicDeploymentEnv()).NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY;
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

  if (mode === "mainnet" && !hasProductionRandomnessMetadata(snapshot)) {
    return {
      mode,
      readiness: "incomplete",
      chainName,
      chainId: snapshot.chainId,
      message: `${snapshot.network} registry loaded ${deployedAt}, but mainnet readiness requires randomnessProviderKind=pinned-coordinator and a nonzero randomnessCoordinator.`,
      contracts
    };
  }


  if (mode === "mainnet" && !hasProductionRoleMetadata(snapshot)) {
    return {
      mode,
      readiness: "incomplete",
      chainName,
      chainId: snapshot.chainId,
      message: `${snapshot.network} registry loaded ${deployedAt}, but mainnet readiness requires valid protocolAdmin, operations, guardian, and treasury role holders.`,
      contracts
    };
  }

  if (mode === "mainnet" && snapshot.launchState !== "active") {
    return {
      mode,
      readiness: "incomplete",
      chainName,
      chainId: snapshot.chainId,
      message: `${snapshot.network} registry loaded ${deployedAt} in ${snapshot.launchState ?? "unspecified"} launch state. Mainnet is read-only until launchState=active.`,
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

export function resolveChainContext(snapshot: DeploymentRegistrySnapshot | null): ChainContext {
  const status = resolveDeploymentStatus(snapshot);
  const chain = status.mode === "mainnet" ? robinhoodChain : robinhoodChainTestnet;
  const isDemo = status.mode === "demo";
  const isMainnet = status.mode === "mainnet";
  const environmentLabel = isDemo ? "Demo" : isMainnet ? "Mainnet" : "Testnet";
  const randomnessProviderKind = snapshot?.randomnessProviderKind ?? null;
  const productionRandomnessReady = !isMainnet || hasProductionRandomnessMetadata(snapshot);
  const productionRolesReady = !isMainnet || hasProductionRoleMetadata(snapshot);
  const launchState = snapshot?.launchState ?? null;
  const launchActive = !isMainnet || launchState === "active";
  const registryReadyForWrites = !isMainnet || status.readiness === "ready";
  const writeBlockReason = isDemo
    ? "Demo mode does not submit wallet transactions."
    : !productionRandomnessReady
      ? "Mainnet writes are locked because the registry does not declare randomnessProviderKind=pinned-coordinator with a valid nonzero randomnessCoordinator."
      : !productionRolesReady
        ? "Mainnet writes are locked because production role-holder metadata is missing or invalid."
        : !launchActive
          ? `Mainnet is read-only while launchState is ${launchState ?? "unspecified"}.`
      : !registryReadyForWrites
        ? "Mainnet writes are locked because the deployment registry is incomplete."
      : null;

  return {
    chain,
    chainId: chain.id,
    chainName: chain.name,
    disclosure: isDemo
      ? "Demo mode uses illustrative inventory and local interaction state. No wallet transaction is available until a reviewed deployment registry is configured."
      : isMainnet && !productionRandomnessReady
        ? "Mainnet browsing is available, but wallet actions are locked until registry metadata identifies a valid pinned randomness coordinator."
      : isMainnet && !productionRolesReady
        ? "Mainnet browsing is available, but wallet actions are locked until all production role holders are declared with valid addresses."
      : isMainnet && !launchActive
        ? `Mainnet is deployed in ${launchState ?? "unspecified"} launch state and is currently read-only.`
      : isMainnet
        ? "Mainnet actions use real ETH and are irreversible after confirmation. Review the contract call, price, fees, and custody effect before signing."
        : "Testnet actions use test assets and have no monetary value. Contract calls still require wallet confirmation and network gas.",
    environmentLabel,
    explorerName: chain.blockExplorers.default.name,
    explorerUrl: chain.blockExplorers.default.url,
    isDemo,
    isMainnet,
    launchState,
    mode: status.mode,
    nativeCurrencySymbol: chain.nativeCurrency.symbol,
    productionRandomnessReady,
    productionRolesReady,
    randomnessProviderKind,
    readiness: status.readiness,
    statusMessage: status.message,
    switchLabel: `Switch to ${environmentLabel === "Demo" ? chain.name : environmentLabel}`,
    transactionLabel: isDemo ? "Preview only" : isMainnet && !launchActive ? "Mainnet read-only" : `${environmentLabel} transaction`,
    writeBlockReason,
    writesEnabled: !isDemo && productionRandomnessReady && productionRolesReady && launchActive && registryReadyForWrites
  };
}

export function loadChainContextFromEnv(env?: DeploymentRegistryEnv): ChainContext {
  return resolveChainContext(loadDeploymentRegistrySnapshotFromEnv(env));
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
