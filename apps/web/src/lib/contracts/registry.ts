import type { Address } from "viem";
import {
  type DeploymentRegistrySnapshot,
  type DeploymentStatus,
  requiredProtocolContracts,
  resolveDeploymentStatus
} from "../deployments";

export type ProtocolContractName = (typeof requiredProtocolContracts)[number];
export type ProtocolContracts = Record<ProtocolContractName, Address>;

export type ReadyContractRegistry = {
  status: DeploymentStatus;
  chainId: number;
  contracts: ProtocolContracts | null;
};

export function getReadyContractRegistry(snapshot: DeploymentRegistrySnapshot | null): ReadyContractRegistry {
  const status = resolveDeploymentStatus(snapshot);

  if (status.readiness !== "ready" || snapshot?.contracts === undefined) {
    return { status, chainId: status.chainId, contracts: null };
  }

  const contracts = Object.fromEntries(
    requiredProtocolContracts.map((name) => [name, snapshot.contracts?.[name] as Address])
  ) as ProtocolContracts;

  return { status, chainId: status.chainId, contracts };
}
