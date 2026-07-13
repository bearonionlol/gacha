import { AppShell } from "../../components/app-shell";
import { VaultAscensionWorkbench } from "../../components/vault-ascension-workbench";
import { VaultForgeLivePanel } from "../../components/vault-forge-live-panel";

export default function ForgePage() {
  return (
    <AppShell activePath="/forge">
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="forge-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Inventory-backed crafting</span>
              <h1 id="forge-title">The Forge</h1>
            </div>
            <span className="chain-pill">3 by 3 recipes</span>
          </div>
          <p>
            Pick a recipe, match its nine-cell seal with Dust, and preview every consumed or retained input before you
            craft. Protected Anchors stay in your wallet; only clearly marked duplicates can transfer.
          </p>
        </section>
        <VaultAscensionWorkbench />
        <VaultForgeLivePanel />
      </main>
    </AppShell>
  );
}
