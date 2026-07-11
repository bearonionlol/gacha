import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import {
  getDeploymentDiagnostics,
  loadDeploymentRegistrySnapshotFromEnv,
  requiredDeploymentContracts,
  requiredProtocolContracts,
  requiredVaultForgeContracts
} from "../lib/deployments";
import {
  getPublicTestnetReadiness,
  type PublicTestnetReadinessEnv,
  type PublicTestnetReadinessStatus,
  type PublicTestnetReadinessSummary
} from "../lib/public-testnet-readiness";

type PublicTestnetReadinessPanelProps = {
  env?: PublicTestnetReadinessEnv;
};

const summaryLabels: Record<PublicTestnetReadinessSummary, string> = {
  blocked: "blocked",
  needs_review: "needs review",
  ready: "ready"
};

function StatusIcon({ status }: { status: PublicTestnetReadinessStatus }) {
  if (status === "pass") {
    return <CheckCircle2 size={16} aria-hidden="true" />;
  }

  if (status === "warn") {
    return <AlertTriangle size={16} aria-hidden="true" />;
  }

  return <XCircle size={16} aria-hidden="true" />;
}

export function PublicTestnetReadinessPanel({
  env
}: PublicTestnetReadinessPanelProps) {
  const readiness = getPublicTestnetReadiness(env);
  const diagnostics = getDeploymentDiagnostics(loadDeploymentRegistrySnapshotFromEnv(env));

  return (
    <div className="panel public-readiness-panel">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Launch control</span>
          <h2>Public testnet readiness</h2>
        </div>
        <span className={`chain-pill readiness-pill ${readiness.summary}`}>
          <CircleDashed size={14} aria-hidden="true" />
          {summaryLabels[readiness.summary]}
        </span>
      </div>

      <p>
        Use this checklist as the operator go/no-go before inviting public testers. It validates the app-facing registry,
        RPC, chain mode, and admin rehearsal surface without exposing private keys.
      </p>

      <ul className="readiness-check-list" aria-label="Public testnet readiness checks">
        {readiness.checks.map((check) => (
          <li className={`readiness-check ${check.status}`} key={check.id}>
            <span className="readiness-check-icon">
              <StatusIcon status={check.status} />
            </span>
            <span>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </span>
          </li>
        ))}
      </ul>

      <div className="deployment-diagnostic-summary" aria-label="Deployment contract summary">
        <div>
          <span>Base protocol</span>
          <strong>
            {diagnostics.baseReadyCount}/{requiredProtocolContracts.length}
          </strong>
          <small>
            {diagnostics.baseReady
              ? "write surfaces available"
              : diagnostics.targetChainReady
                ? "base writes blocked"
                : "testnet registry required"}
          </small>
        </div>
        <div>
          <span>Vault Forge V4</span>
          <strong>
            {diagnostics.vaultForgeReadyCount}/{requiredVaultForgeContracts.length}
          </strong>
          <small>
            {diagnostics.vaultForgeReady
              ? "Forge settlement available"
              : diagnostics.targetChainReady
                ? "deployment incomplete"
                : "testnet registry required"}
          </small>
        </div>
        <div>
          <span>Full registry</span>
          <strong>
            {diagnostics.totalReadyCount}/{requiredDeploymentContracts.length}
          </strong>
          <small>{diagnostics.timestamp ?? "no deployment timestamp"}</small>
        </div>
      </div>

      <details className="deployment-contract-details">
        <summary>Contract-by-contract diagnosis</summary>
        <ul>
          {diagnostics.contracts.map((contract) => (
            <li className={contract.status} key={contract.name}>
              <span>
                <strong>{contract.name}</strong>
                <small>{contract.group === "base" ? "Base protocol" : "Vault Forge V4"}</small>
              </span>
              <span className="deployment-contract-value">
                <em>{contract.status}</em>
                <code>{contract.address === null ? "no address" : compactAddress(contract.address)}</code>
              </span>
            </li>
          ))}
        </ul>
      </details>

      <p className="disclosure">
        Mainnet migration stays blocked until the mainnet migration runbook is complete and reviewed.
      </p>
    </div>
  );
}

function compactAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}
