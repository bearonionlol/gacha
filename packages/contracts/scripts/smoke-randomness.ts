import { getAddress, isAddress, ZeroAddress } from "ethers";
import type { Environment } from "./mainnet-fork-config";

export type RandomnessDeploymentMetadata = {
  randomnessProviderKind?: unknown;
  randomnessCoordinator?: unknown;
};

export type CommitRevealSmokePlan = {
  kind: "commit-reveal-demo";
  artifactName: "CommitRevealRandomnessProvider";
  label: "CommitRevealRandomnessProvider";
};

export type CoordinatorSmokePlan = {
  kind: "pinned-coordinator";
  artifactName: "CoordinatorRandomnessProvider";
  label: "CoordinatorRandomnessProvider";
  coordinator: string;
  coordinatorCodeHash: string;
  maxRequestFeeWei: bigint;
};

export type RandomnessSmokePlan = CommitRevealSmokePlan | CoordinatorSmokePlan;

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for pinned-coordinator smoke verification`);
  return value;
}

function requiredAddress(env: Environment, name: string): string {
  const value = required(env, name);
  if (!isAddress(value) || value.toLowerCase() === ZeroAddress) {
    throw new Error(`${name} must be a non-zero EVM address`);
  }
  return getAddress(value);
}

export function resolveRandomnessSmokePlan(
  deployment: RandomnessDeploymentMetadata,
  networkName: string,
  env: Environment
): RandomnessSmokePlan {
  const kind = deployment.randomnessProviderKind;
  if (kind === undefined) {
    if (networkName === "robinhoodMainnet") {
      throw new Error(
        "Mainnet smoke blocked: deployment.randomnessProviderKind is required"
      );
    }
    if (deployment.randomnessCoordinator !== undefined) {
      throw new Error(
        "Commit/reveal deployment metadata cannot include randomnessCoordinator"
      );
    }
    return {
      kind: "commit-reveal-demo",
      artifactName: "CommitRevealRandomnessProvider",
      label: "CommitRevealRandomnessProvider"
    };
  }

  if (kind === "commit-reveal-demo") {
    if (networkName === "robinhoodMainnet") {
      throw new Error(
        "Mainnet smoke blocked: commit-reveal-demo randomness is not production-safe"
      );
    }
    if (deployment.randomnessCoordinator !== undefined) {
      throw new Error(
        "Commit/reveal deployment metadata cannot include randomnessCoordinator"
      );
    }
    return {
      kind,
      artifactName: "CommitRevealRandomnessProvider",
      label: "CommitRevealRandomnessProvider"
    };
  }

  if (kind !== "pinned-coordinator") {
    throw new Error(`Unsupported deployment.randomnessProviderKind: ${String(kind)}`);
  }
  if (networkName !== "robinhoodMainnet") {
    throw new Error("pinned-coordinator smoke verification is restricted to robinhoodMainnet");
  }

  const coordinator = requiredAddress(env, "ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS");
  if (
    typeof deployment.randomnessCoordinator !== "string" ||
    !isAddress(deployment.randomnessCoordinator) ||
    getAddress(deployment.randomnessCoordinator) !== coordinator
  ) {
    throw new Error(
      "Deployment randomnessCoordinator does not match ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS"
    );
  }

  const coordinatorCodeHash = required(env, "ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH");
  if (!/^0x[0-9a-fA-F]{64}$/.test(coordinatorCodeHash) || /^0x0{64}$/i.test(coordinatorCodeHash)) {
    throw new Error(
      "ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH must be a non-zero 32-byte hex hash"
    );
  }
  const maxRequestFeeRaw = required(env, "ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI");
  if (!/^\d+$/.test(maxRequestFeeRaw)) {
    throw new Error(
      "ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI must be a non-negative integer"
    );
  }

  return {
    kind,
    artifactName: "CoordinatorRandomnessProvider",
    label: "CoordinatorRandomnessProvider",
    coordinator,
    coordinatorCodeHash: coordinatorCodeHash.toLowerCase(),
    maxRequestFeeWei: BigInt(maxRequestFeeRaw)
  };
}
