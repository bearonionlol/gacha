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
  contracts?: Record<string, string>;
};

export type DeploymentStatus = {
  mode: "demo" | "testnet" | "mainnet";
  chainName: string;
  chainId: number;
  message: string;
  contracts: { name: string; address: string }[];
};

export function resolveDeploymentStatus(snapshot: DeploymentRegistrySnapshot | null): DeploymentStatus {
  if (snapshot === null) {
    return {
      mode: "demo",
      chainName: robinhoodChainTestnet.name,
      chainId: robinhoodChainTestnet.id,
      message: "Demo mode is using deterministic local app state until a deployment registry is present.",
      contracts: []
    };
  }

  const contracts = Object.entries(snapshot.contracts ?? {}).map(([name, address]) => ({ name, address }));
  const deployedAt = snapshot.deployedAt === undefined ? "from the local registry" : `at ${snapshot.deployedAt}`;
  const knownChain =
    snapshot.chainId === ROBINHOOD_CHAIN_MAINNET_ID || snapshot.chainId === ROBINHOOD_CHAIN_TESTNET_ID;

  if (!knownChain) {
    return {
      mode: "demo",
      chainName: "Unsupported chain",
      chainId: snapshot.chainId,
      message: `${snapshot.network} registry loaded ${deployedAt}, but chain ${snapshot.chainId} is an unsupported chain for this app build.`,
      contracts
    };
  }

  const chainName = snapshot.chainId === ROBINHOOD_CHAIN_MAINNET_ID ? robinhoodChain.name : robinhoodChainTestnet.name;
  const mode = snapshot.chainId === ROBINHOOD_CHAIN_MAINNET_ID ? "mainnet" : "testnet";

  return {
    mode,
    chainName,
    chainId: snapshot.chainId,
    message: `${snapshot.network} deployment registry loaded ${deployedAt}.`,
    contracts
  };
}
