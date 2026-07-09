import { AppShell } from "../../components/app-shell";
import { VaultGrid } from "../../components/vault-grid";

export default function VaultPage() {
  return (
    <AppShell>
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="vault-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Vault portfolio</span>
              <h1 id="vault-title">Vault Portfolio</h1>
            </div>
            <span className="chain-pill">Read-only demo</span>
          </div>
          <p>
            Track inventory-backed collectibles, buyback quotes, redeemability, grail tier, and verified photo-hash
            status before routing an item to market, Forge, or redemption.
          </p>
        </section>
        <VaultGrid />
      </main>
    </AppShell>
  );
}
