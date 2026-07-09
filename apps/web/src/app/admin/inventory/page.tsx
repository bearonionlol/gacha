import { AdminInventoryConsole } from "../../../components/admin-inventory-console";
import { AppShell } from "../../../components/app-shell";

export default function AdminInventoryPage() {
  return (
    <AppShell>
      <main className="command-center route-page">
        <section className="panel route-hero" aria-labelledby="admin-inventory-title">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Operator console</span>
              <h1 id="admin-inventory-title">Inventory Intake</h1>
            </div>
            <span className="chain-pill">Read-only sample data</span>
          </div>
          <p>
            Review required inventory fields and custody lifecycle states. Live fulfillment writes are available in the
            operator panel below; sample intake records and exports remain read-only.
          </p>
        </section>
        <AdminInventoryConsole />
      </main>
    </AppShell>
  );
}
