import { AppShell } from "../../components/app-shell";
import { VaultAscensionWorkbench } from "../../components/vault-ascension-workbench";
import { VaultForgeLivePanel } from "../../components/vault-forge-live-panel";

export default function ForgePage() {
  return (
    <AppShell>
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="forge-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Inventory-backed crafting</span>
              <h1 id="forge-title">Vault Ascension</h1>
            </div>
            <span className="chain-pill">Forge V4</span>
          </div>
          <p>
            Shape mixed Dust into exact 3 by 3 seals, trade eligible duplicates, and reveal real cards from reserved
            vault inventory. Your protected Anchor never leaves your wallet.
          </p>
        </section>
        <VaultAscensionWorkbench />
        <VaultForgeLivePanel />
      </main>
    </AppShell>
  );
}
