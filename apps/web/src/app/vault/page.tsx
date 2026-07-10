import { AppShell } from "../../components/app-shell";
import { VaultGrid } from "../../components/vault-grid";

export default function VaultPage() {
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
        <VaultGrid />
      </main>
    </AppShell>
  );
}
