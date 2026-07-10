import { AdminInventoryConsole } from "../../../components/admin-inventory-console";
import { AppShell } from "../../../components/app-shell";

export default function AdminInventoryPage() {
  return (
    <AppShell activePath="/admin/inventory">
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="admin-inventory-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Operator console</span>
              <h1 id="admin-inventory-title">Inventory &amp; Pool Intake</h1>
            </div>
            <span className="chain-pill">Forge V4 schema</span>
          </div>
          <p>
            Validate custody, collectible identity, Forge Tier, trade-in policy, and tier-pool eligibility before an
            item can back a gacha pull or Vault Ascension outcome.
          </p>
        </section>
        <AdminInventoryConsole />
      </main>
    </AppShell>
  );
}
