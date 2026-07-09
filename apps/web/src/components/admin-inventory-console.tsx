import { Download, FileJson, ShieldCheck } from "lucide-react";
import { inventoryStatuses, sampleInventory } from "@gacha/inventory";
import { formatCents } from "../lib/format";
import { RedemptionOpsPanel } from "./testnet-write-panels";

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
        <ul className="required-field-list" aria-label="Required inventory fields">
          {requiredFields.map((field) => (
            <li key={field}>
              <code>{field}</code>
            </li>
          ))}
        </ul>
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

        <div className="inventory-table-wrap">
          <table className="inventory-table" aria-label="Inventory intake records">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Brand</th>
                <th scope="col">Category</th>
                <th scope="col">Custody</th>
                <th scope="col">Photo hash</th>
                <th scope="col">Estimate</th>
                <th scope="col">Buyback</th>
              </tr>
            </thead>
            <tbody>
              {sampleInventory.map((item) => (
                <tr key={item.inventoryId}>
                  <td>
                    <strong>{item.cardName}</strong>
                    <code>{item.inventoryId}</code>
                  </td>
                  <td>{item.brand}</td>
                  <td>{item.category}</td>
                  <td>{item.custodyStatus}</td>
                  <td>
                    <code>{item.photoHash.slice(0, 18)}...</code>
                  </td>
                  <td>{formatCents(item.marketEstimateCents)}</td>
                  <td>{formatCents(item.buybackQuoteCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel export-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Export hooks</span>
            <h2>Read-only Exports</h2>
          </div>
        </div>
        <p id="export-disabled-reason">
          JSON and CSV exports are wired to inventory helpers in the next persistence pass; current controls are disabled
          so this screen does not imply live export or production writes.
        </p>
        <div className="action-grid">
          <button aria-describedby="export-disabled-reason" className="secondary-action" disabled type="button">
            <FileJson size={16} aria-hidden="true" />
            Export JSON
          </button>
          <button aria-describedby="export-disabled-reason" className="secondary-action" disabled type="button">
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="panel operator-checklist-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Fulfillment ops</span>
            <h2>Operator Checklist</h2>
          </div>
          <span className="chain-pill">testnet</span>
        </div>
        <ul className="operator-checklist" aria-label="Redemption operator requirements">
          <li>Confirm the item is escrowed before approval.</li>
          <li>Use the assigned redemption administrator wallet.</li>
          <li>Record packed, shipped, completed, or cancelled status as separate transactions.</li>
        </ul>
      </div>

      <RedemptionOpsPanel />
    </section>
  );
}
