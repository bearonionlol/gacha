import { exportInventoryAsCsv, exportInventoryAsJson } from "@gacha/inventory";
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { browserInventoryStatuses, browserSeededInventory } from "../lib/browser-seeded-inventory";
import { formatCents } from "../lib/format";
import { reconcileInventory } from "../lib/inventory-reconciliation";
import { InventoryExportControls } from "./inventory-export-controls";
import { PublicTestnetReadinessPanel } from "./public-testnet-readiness-panel";
import { RedemptionOpsPanel } from "./testnet-write-panels";

const requiredFields = [
  "inventoryId",
  "brand",
  "category",
  "photoHash",
  "custodyStatus",
  "marketEstimateCents",
  "buybackQuoteCents",
  "canonicalCollectibleKey",
  "forgeTier",
  "tradeInEligible",
  "tierPoolEligible",
  "forgeSetKey"
];

const reconciliation = reconcileInventory(browserSeededInventory);
const inventoryJson = exportInventoryAsJson(browserSeededInventory);
const inventoryCsv = exportInventoryAsCsv(browserSeededInventory);

export function AdminInventoryConsole() {
  return (
    <section className="admin-console" aria-label="Admin inventory console">
      <PublicTestnetReadinessPanel />

      <div className="panel inventory-reconciliation-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Deterministic intake audit</span>
            <h2>Inventory Reconciliation</h2>
          </div>
          <span className={`chain-pill reconciliation-pill ${reconciliation.summary}`}>
            <ReconciliationIcon summary={reconciliation.summary} />
            {reconciliation.summary === "needs_review" ? "needs review" : reconciliation.summary}
          </span>
        </div>

        <dl className="inventory-reconciliation-stats">
          <div>
            <dt>Custody records</dt>
            <dd>{reconciliation.counts.total}</dd>
          </div>
          <div>
            <dt>Drop eligible</dt>
            <dd>{reconciliation.counts.dropEligible}</dd>
          </div>
          <div>
            <dt>Trade-in inputs</dt>
            <dd>{reconciliation.counts.tradeInEligible}</dd>
          </div>
          <div>
            <dt>Tier-pool outputs</dt>
            <dd>{reconciliation.counts.tierPoolEligible}</dd>
          </div>
          <div>
            <dt>Protected grails</dt>
            <dd>{reconciliation.counts.protectedGrails}</dd>
          </div>
        </dl>

        <div className="tier-pool-reconciliation" aria-label="Tier pool inventory counts">
          {([1, 2, 3, 4] as const).map((tier) => (
            <span key={tier}>
              Tier {tier}
              <strong>{reconciliation.tierPoolByTier[tier]}</strong>
            </span>
          ))}
        </div>

        {reconciliation.issues.length === 0 ? (
          <p className="reconciliation-clear">
            <CheckCircle2 size={17} aria-hidden="true" />
            IDs, custody photos, valuations, grail protection, and ascension output reserves pass deterministic checks.
          </p>
        ) : (
          <ul className="reconciliation-issue-list" aria-label="Inventory reconciliation issues">
            {reconciliation.issues.map((issue) => (
              <li className={issue.severity} key={issue.id}>
                {issue.severity === "error" ? (
                  <XCircle size={16} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={16} aria-hidden="true" />
                )}
                <span>
                  <strong>{issue.label}</strong>
                  <small>{issue.detail}</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

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
          <span className="chain-pill">{browserInventoryStatuses.length} states</span>
        </div>
        <ol className="inventory-lifecycle">
          {browserInventoryStatuses.map((status) => (
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
          <span className="chain-pill">{browserSeededInventory.length} samples</span>
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
                <th scope="col">Forge tier</th>
                <th scope="col">Trade-in</th>
                <th scope="col">Tier pool</th>
              </tr>
            </thead>
            <tbody>
              {browserSeededInventory.map((item) => (
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
                  <td>Tier {item.forgeTier}</td>
                  <td>{item.tradeInEligible ? "Eligible" : "Protected"}</td>
                  <td>{item.tierPoolEligible ? "Eligible" : "Excluded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel export-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Validated handoff</span>
            <h2>Inventory Exports</h2>
          </div>
        </div>
        <p>
          Download schema-validated snapshots for custody reconciliation and operator review. Exports contain public
          inventory metadata only and never include wallet credentials.
        </p>
        <InventoryExportControls csv={inventoryCsv} json={inventoryJson} />
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

function ReconciliationIcon({ summary }: { summary: "blocked" | "needs_review" | "ready" }) {
  if (summary === "ready") return <CheckCircle2 size={14} aria-hidden="true" />;
  if (summary === "needs_review") return <AlertTriangle size={14} aria-hidden="true" />;
  return <XCircle size={14} aria-hidden="true" />;
}
