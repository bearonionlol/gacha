import { AppShell } from "../../components/app-shell";
import { VaultGrid } from "../../components/vault-grid";

export default function VaultPage() {
  return (
    <AppShell activePath="/vault">
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="vault-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Collection and Forge custody</span>
              <h1 id="vault-title">Vault Portfolio</h1>
            </div>
            <span className="chain-pill">Forge V4 aware</span>
          </div>
          <p>
            Track inventory-backed collectibles, buyback quotes, Forge Tier, grail class, and verified custody. Cards
            excluded from trade-in remain available as Anchor candidates; only eligible duplicates can enter a claim.
          </p>
        </section>
        <VaultGrid />
      </main>
    </AppShell>
  );
}
