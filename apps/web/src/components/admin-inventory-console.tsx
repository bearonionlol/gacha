import { Download, FileJson, ShieldCheck } from "lucide-react";
import { inventoryStatuses, sampleInventory } from "@gacha/inventory";
import { formatCents } from "../lib/format";

const requiredFields = [
  "inventoryId",
  "brand",
  "category",
  "photoHash",
  "custodyStatus",
  "marketEstimateCents",
  "buybackQuoteCents"
];

export function AdminInventoryConsole() {
  return (
    <section className="admin-console" aria-label="Admin inventory console">
      <div className="panel admin-fields-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Schema guardrails</span>
            <h2>Required Fields</h2>
          </div>
          <ShieldCheck size={18} aria-hidden="true" />
        </div>
        <div className="required-field-list" aria-label="Required inventory fields">
          {requiredFields.map((field) => (
            <code key={field}>{field}</code>
          ))}
        </div>
      </div>

      <div className="panel lifecycle-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Custody states</span>
            <h2>Inventory Lifecycle</h2>
          </div>
          <span className="chain-pill">{inventoryStatuses.length} states</span>
        </div>
        <ol className="inventory-lifecycle">
          {inventoryStatuses.map((status) => (
            <li key={status}>{status}</li>
          ))}
        </ol>
      </div>

      <div className="panel inventory-table-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Intake queue</span>
            <h2>Sample Inventory Records</h2>
          </div>
          <span className="chain-pill">{sampleInventory.length} samples</span>
        </div>

        <div className="inventory-table" role="table" aria-label="Inventory intake records">
          <div className="inventory-table-row header" role="row">
            <span role="columnheader">Item</span>
            <span role="columnheader">Brand</span>
            <span role="columnheader">Category</span>
            <span role="columnheader">Custody</span>
            <span role="columnheader">Photo hash</span>
            <span role="columnheader">Estimate</span>
            <span role="columnheader">Buyback</span>
          </div>

          {sampleInventory.map((item) => (
            <div className="inventory-table-row" role="row" key={item.inventoryId}>
              <span role="cell">
                <strong>{item.cardName}</strong>
                <code>{item.inventoryId}</code>
              </span>
              <span role="cell">{item.brand}</span>
              <span role="cell">{item.category}</span>
              <span role="cell">{item.custodyStatus}</span>
              <span role="cell">
                <code>{item.photoHash.slice(0, 18)}...</code>
              </span>
              <span role="cell">{formatCents(item.marketEstimateCents)}</span>
              <span role="cell">{formatCents(item.buybackQuoteCents)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel export-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Export hooks</span>
            <h2>Read-only Exports</h2>
          </div>
        </div>
        <p>
          JSON and CSV exports are wired to inventory helpers in the next persistence pass; current controls are disabled
          so this screen does not imply live export or production writes.
        </p>
        <div className="action-grid">
          <button className="secondary-action" disabled type="button">
            <FileJson size={16} aria-hidden="true" />
            Export JSON
          </button>
          <button className="secondary-action" disabled type="button">
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>
    </section>
  );
}
