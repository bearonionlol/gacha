import { getAddress, isAddress, ZeroAddress } from "ethers";
import {
  MAINNET_DEPLOYMENT_CONFIRMATION,
  requireMainnetDeploymentConfig
} from "./mainnet-deployment-config";
import type { Environment } from "./mainnet-fork-config";

export type SmokeRolePlan = {
  deployer: string;
  protocolAdmin: string;
  operations: string;
  guardian: string;
  treasury: string;
};

export function resolveSmokeRolePlan(
  deploymentDeployer: string,
  networkName: string,
  env: Environment
): SmokeRolePlan {
  if (
    !isAddress(deploymentDeployer) ||
    deploymentDeployer.toLowerCase() === ZeroAddress
  ) {
    throw new Error("Deployment registry has an invalid deployer address");
  }
  const deployer = getAddress(deploymentDeployer);
  if (networkName !== "robinhoodMainnet") {
    return {
      deployer,
      protocolAdmin: deployer,
      operations: deployer,
      guardian: deployer,
      treasury: deployer
    };
  }

  const config = requireMainnetDeploymentConfig({
    ...env,
    MAINNET_DEPLOYMENT_CONFIRMATION
  });
  if (config.deployer !== deployer) {
    throw new Error(
      "Deployment registry deployer does not match MAINNET_RELEASE_DEPLOYER_ADDRESS"
    );
  }
  return config;
}
