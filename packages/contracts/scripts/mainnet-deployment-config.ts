import { ZeroAddress, getAddress, isAddress } from "ethers";

export const MAINNET_DEPLOYMENT_CONFIRMATION = "DEPLOY_ROBINHOOD_MAINNET_PAUSED_CANARY";

export type MainnetDeploymentConfig = {
  deployer: string;
  protocolAdmin: string;
  operations: string;
  guardian: string;
  treasury: string;
};

type Environment = Readonly<Record<string, string | undefined>>;

function requireValue(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Mainnet deploy blocked: ${name} is required`);
  return value;
}

function requireAddress(env: Environment, name: string): string {
  const value = requireValue(env, name);
  if (!isAddress(value) || value.toLowerCase() === ZeroAddress) {
    throw new Error(`Mainnet deploy blocked: ${name} must be a non-zero EVM address`);
  }
  return getAddress(value);
}

export function requireMainnetDeploymentConfig(env: Environment = process.env): MainnetDeploymentConfig {
  const confirmation = requireValue(env, "MAINNET_DEPLOYMENT_CONFIRMATION");
  if (confirmation !== MAINNET_DEPLOYMENT_CONFIRMATION) {
    throw new Error(
      `Mainnet deploy blocked: MAINNET_DEPLOYMENT_CONFIRMATION must equal ${MAINNET_DEPLOYMENT_CONFIRMATION}`
    );
  }

  const config = {
    deployer: requireAddress(env, "MAINNET_RELEASE_DEPLOYER_ADDRESS"),
    protocolAdmin: requireAddress(env, "MAINNET_RELEASE_ADMIN_ADDRESS"),
    operations: requireAddress(env, "MAINNET_RELEASE_OPERATIONS_ADDRESS"),
    guardian: requireAddress(env, "MAINNET_RELEASE_GUARDIAN_ADDRESS"),
    treasury: requireAddress(env, "MAINNET_RELEASE_TREASURY_ADDRESS")
  };

  const roleAddresses = Object.values(config).map((address) => address.toLowerCase());
  if (new Set(roleAddresses).size !== roleAddresses.length) {
    throw new Error(
      "Mainnet deploy blocked: deployer, protocol admin, operations, guardian, and treasury addresses must be distinct"
    );
  }

  return config;
}
