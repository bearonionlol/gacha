import { AppShell } from "../../components/app-shell";
import { KnownInventoryTokenPicker } from "../../components/known-inventory-token-picker";
import { VaultGrid } from "../../components/vault-grid";
import { loadDeploymentRegistrySnapshotFromEnv } from "../../lib/deployments";
import { getReadyContractRegistry } from "../../lib/contracts/registry";

export default function VaultPage() {
  const registry = getReadyContractRegistry(loadDeploymentRegistrySnapshotFromEnv());

  return (
    <AppShell activePath="/vault">
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="vault-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Collection</span>
              <h1 id="vault-title">Your Vault</h1>
            </div>
            <span className="chain-pill">Custody tracked</span>
          </div>
          <p>
            Review each collectible's custody record, estimate, buyback quote, Forge role, and redemption options in one
            place. Estimates are references, not promises of future value.
          </p>
        </section>
        <KnownInventoryTokenPicker
          contracts={registry.contracts}
          mode="vault"
          registryMessage={registry.status.message}
        />
        <VaultGrid />
      </main>
    </AppShell>
  );
}
