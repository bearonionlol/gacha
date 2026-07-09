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

  const chainName = snapshot.chainId === ROBINHOOD_CHAIN_MAINNET_ID ? robinhoodChain.name : robinhoodChainTestnet.name;
  const mode = snapshot.chainId === ROBINHOOD_CHAIN_MAINNET_ID ? "mainnet" : "testnet";
  const contracts = Object.entries(snapshot.contracts ?? {}).map(([name, address]) => ({ name, address }));
  const deployedAt = snapshot.deployedAt === undefined ? "from the local registry" : `at ${snapshot.deployedAt}`;

  return {
    mode,
    chainName,
    chainId:
      snapshot.chainId === ROBINHOOD_CHAIN_MAINNET_ID ? ROBINHOOD_CHAIN_MAINNET_ID : ROBINHOOD_CHAIN_TESTNET_ID,
    message: `${snapshot.network} deployment registry loaded ${deployedAt}.`,
    contracts
  };
}
