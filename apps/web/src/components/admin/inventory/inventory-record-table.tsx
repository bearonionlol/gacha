"use client";

import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";

import styles from "../../../app/admin/inventory/admin-inventory.module.css";
import { formatCents } from "../../../lib/format";
import { formatInventoryStatus } from "./model";
import type { InventoryRecord } from "./types";

type InventoryRecordTableProps = {
  loading: boolean;
  onPageChange: (page: number) => void;
  onSelect: (inventoryId: string) => void;
  page: number;
  pageSize: number;
  records: readonly InventoryRecord[];
  selectedId: string | null;
  total: number;
};

export function InventoryRecordTable(props: InventoryRecordTableProps) {
  const pageCount = Math.max(1, Math.ceil(props.total / props.pageSize));
  return (
    <section className={`panel ${styles.recordsPanel}`} aria-labelledby="inventory-records-title">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Custody ledger</span>
          <h2 id="inventory-records-title">Inventory records</h2>
        </div>
        <span className="chain-pill">{props.total} total</span>
      </div>
      <div className={styles.tableWrap} aria-busy={props.loading}>
        <table className={`inventory-table ${styles.recordsTable}`} aria-label="Inventory intake records">
          <thead><tr><th>Item</th><th>Custody</th><th>Value</th><th>Forge</th><th>Revision</th></tr></thead>
          <tbody>
            {props.records.map(({ item, revision }) => (
              <tr className={item.inventoryId === props.selectedId ? styles.selectedRow : undefined} key={item.inventoryId}>
                <td>
                  <button className={styles.itemButton} onClick={() => props.onSelect(item.inventoryId)} type="button">
                    <strong>{item.cardName}</strong><code>{item.inventoryId}</code><small>{item.setName} · {item.cardNumber || "No number"}</small>
                  </button>
                </td>
                <td><span className={styles.statusBadge}>{formatInventoryStatus(item.custodyStatus)}</span><small>{item.vaultLocationLabel || "Unassigned"}</small></td>
                <td><strong>{formatCents(item.marketEstimateCents)}</strong><small>{item.brand.replace("_", " ")}</small></td>
                <td><strong>Tier {item.forgeTier}</strong><small>{item.tierPoolEligible ? "Pool eligible" : "Not in pool"}</small></td>
                <td><code>{revision === 0 ? "demo" : `r${revision}`}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        {props.records.length === 0 ? (
          <div className={styles.emptyState}><PackageSearch aria-hidden="true" size={24} /><strong>No matching inventory</strong><span>Adjust the current filters or create a draft intake record.</span></div>
        ) : null}
      </div>
      <div className={styles.pagination}>
        <span>Page {Math.min(props.page + 1, pageCount)} of {pageCount}</span>
        <div>
          <button aria-label="Previous inventory page" disabled={props.page === 0 || props.loading} onClick={() => props.onPageChange(props.page - 1)} title="Previous page" type="button"><ChevronLeft aria-hidden="true" size={17} /></button>
          <button aria-label="Next inventory page" disabled={props.page + 1 >= pageCount || props.loading} onClick={() => props.onPageChange(props.page + 1)} title="Next page" type="button"><ChevronRight aria-hidden="true" size={17} /></button>
        </div>
      </div>
    </section>
  );
}
