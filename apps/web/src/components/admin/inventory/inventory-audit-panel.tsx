"use client";

import { Clock3, FileClock } from "lucide-react";

import styles from "../../../app/admin/inventory/admin-inventory.module.css";
import type { InventoryAuditRecord, OnchainQueueRecord } from "./types";

const labelAction = (action: string): string => action.replace("inventory.", "").replaceAll("_", " ");
const shortWallet = (wallet: string): string => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

export function InventoryAuditPanel(props: {
  events: readonly InventoryAuditRecord[];
  loading: boolean;
  operations: readonly OnchainQueueRecord[];
  selectedInventoryId: string | null;
}) {
  return (
    <section className={`panel ${styles.auditPanel}`} aria-labelledby="audit-title">
      <div className="panel-header compact">
        <div><span className="eyebrow">Append-only trail</span><h2 id="audit-title">Audit &amp; multisig queue</h2></div>
        <FileClock aria-hidden="true" size={19} />
      </div>
      {props.selectedInventoryId === null ? <p>Select a record to inspect its operator history.</p> : props.loading ? <p role="status">Loading audit history…</p> : (
        <>
          <code className={styles.auditInventoryId}>{props.selectedInventoryId}</code>
          <ol className={styles.auditList}>
            {props.events.map((event) => (
              <li key={event.eventId}>
                <Clock3 aria-hidden="true" size={15} />
                <span><strong>{labelAction(event.action)}</strong><small>{new Date(event.occurredAt).toLocaleString()} · {shortWallet(event.actor.walletAddress)} · r{event.revision}</small></span>
              </li>
            ))}
          </ol>
          {props.events.length === 0 ? <p>No audit events are recorded for this item.</p> : null}
          {props.operations.length > 0 ? <ul className={styles.operationList}>{props.operations.map((operation) => <li key={operation.operationId}><strong>{labelAction(operation.action)}</strong><span>{operation.status} · revision {operation.expectedRevision}</span><code>{operation.multisigAddress}</code></li>)}</ul> : null}
        </>
      )}
    </section>
  );
}
