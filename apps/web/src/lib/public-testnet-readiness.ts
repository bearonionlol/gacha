import { ROBINHOOD_CHAIN_TESTNET_ID } from "@gacha/shared";
import { loadDeploymentRegistrySnapshotFromEnv, resolveDeploymentStatus } from "./deployments";

export type PublicTestnetReadinessStatus = "pass" | "warn" | "fail";
export type PublicTestnetReadinessSummary = "ready" | "needs_review" | "blocked";
export type PublicTestnetReadinessEnv = Record<string, string | undefined>;

export type PublicTestnetReadinessCheck = {
  detail: string;
  id: string;
  label: string;
  status: PublicTestnetReadinessStatus;
};

export type PublicTestnetReadiness = {
  blockingCount: number;
  checks: PublicTestnetReadinessCheck[];
  reviewCount: number;
  summary: PublicTestnetReadinessSummary;
};

function readEnvValue(env: PublicTestnetReadinessEnv, key: string): string {
  return env[key]?.trim() ?? "";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function getPublicTestnetReadiness(
  env: PublicTestnetReadinessEnv = process.env
): PublicTestnetReadiness {
  const deploymentStatus = resolveDeploymentStatus(loadDeploymentRegistrySnapshotFromEnv(env));
  const chainMode = readEnvValue(env, "NEXT_PUBLIC_GACHA_CHAIN_MODE");
  const rpcUrl = readEnvValue(env, "NEXT_PUBLIC_GACHA_RPC_URL");
  const adminEnabled = readEnvValue(env, "NEXT_PUBLIC_GACHA_ENABLE_ADMIN") === "true";

  const registryReady =
    deploymentStatus.mode === "testnet" &&
    deploymentStatus.readiness === "ready" &&
    deploymentStatus.chainId === ROBINHOOD_CHAIN_TESTNET_ID;

  const registryDetail = registryReady
    ? `${deploymentStatus.contracts.length} protocol contracts loaded on Robinhood Chain Testnet.`
    : deploymentStatus.mode === "mainnet"
      ? "Mainnet registry supplied. Public testnet launch requires Robinhood Chain Testnet chain 46630."
      : deploymentStatus.message;

  const checks: PublicTestnetReadinessCheck[] = [
    {
      id: "deployment-registry",
      label: "Deployment registry",
      status: registryReady ? "pass" : "fail",
      detail: registryDetail
    },
    {
      id: "chain-mode",
      label: "Chain mode",
      status: chainMode === "testnet" ? "pass" : "fail",
      detail:
        chainMode === "testnet"
          ? "NEXT_PUBLIC_GACHA_CHAIN_MODE is explicitly set to testnet."
          : "Set NEXT_PUBLIC_GACHA_CHAIN_MODE=testnet before public testnet sessions."
    },
    {
      id: "public-rpc",
      label: "Public RPC",
      status: isHttpUrl(rpcUrl) ? "pass" : "fail",
      detail: isHttpUrl(rpcUrl)
        ? "NEXT_PUBLIC_GACHA_RPC_URL is configured for browser reads and wallet prompts."
        : "Set NEXT_PUBLIC_GACHA_RPC_URL to a reviewed Robinhood testnet RPC endpoint."
    },
    {
      id: "operator-controls",
      label: "Operator controls",
      status: adminEnabled ? "pass" : "warn",
      detail: adminEnabled
        ? "Admin operations are visible for testnet fulfillment rehearsal."
        : "Admin operations are hidden; confirm the operator runbook has a separate fulfillment path."
    },
    {
      id: "mainnet-cutover",
      label: "Mainnet cutover gate",
      status: "pass",
      detail:
        "Mainnet remains gated by the migration runbook, reviewed inventory, approved randomness, and private smoke."
    }
  ];

  const blockingCount = checks.filter((check) => check.status === "fail").length;
  const reviewCount = checks.filter((check) => check.status === "warn").length;

  return {
    blockingCount,
    checks,
    reviewCount,
    summary: blockingCount > 0 ? "blocked" : reviewCount > 0 ? "needs_review" : "ready"
  };
}
