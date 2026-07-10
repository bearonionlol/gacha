"use client";

import type { InventoryItem, InventoryStatus } from "@gacha/inventory";
import { AlertTriangle, CheckCircle2, Filter, LogOut, Plus, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "../app/admin/inventory/admin-inventory.module.css";
import { reconcileInventory } from "../lib/inventory-reconciliation";
import { InventoryExportControls } from "./inventory-export-controls";
import { PublicTestnetReadinessPanel } from "./public-testnet-readiness-panel";
import { RedemptionOpsPanel } from "./testnet-write-panels";
import { AdminAuthPanel } from "./admin/inventory/admin-auth-panel";
import { AdminClientError, adminRequest } from "./admin/inventory/api-client";
import { BulkIntakePanel } from "./admin/inventory/bulk-intake-panel";
import { InventoryAuditPanel } from "./admin/inventory/inventory-audit-panel";
import { InventoryEditor } from "./admin/inventory/inventory-editor";
import { InventoryRecordTable } from "./admin/inventory/inventory-record-table";
import { brands, canEditRole, canManageRole, createDraftInventoryItem, formatInventoryStatus, statuses } from "./admin/inventory/model";
import type {
  AdminConsoleConfiguration,
  AdminSessionView,
  InventoryAuditRecord,
  InventoryFilters,
  InventoryRecord,
  OnchainQueueAction,
  OnchainQueueRecord
} from "./admin/inventory/types";

const PAGE_SIZE = 50;
const requiredFields = [
  "inventoryId", "brand", "category", "photoHash", "custodyStatus", "marketEstimateCents",
  "canonicalCollectibleKey", "forgeTier", "tierPoolEligible", "forgeSetKey"
];

type AdminInventoryConsoleProps = {
  configuration: AdminConsoleConfiguration;
  demoRecords: InventoryRecord[];
};

const initialFilters: InventoryFilters = { brand: "", search: "", status: "" };

export function AdminInventoryConsole({ configuration, demoRecords }: AdminInventoryConsoleProps) {
  const [session, setSession] = useState<AdminSessionView | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [authState, setAuthState] = useState<"checking" | "signed_out" | "signed_in" | "error">(
    configuration.configured ? "checking" : "signed_out"
  );
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<InventoryFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<InventoryFilters>(initialFilters);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(demoRecords[0]?.item.inventoryId ?? null);
  const [newDraft, setNewDraft] = useState<InventoryRecord | null>(null);
  const [auditEvents, setAuditEvents] = useState<InventoryAuditRecord[]>([]);
  const [operations, setOperations] = useState<OnchainQueueRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const restoreSession = useCallback(async () => {
    if (!configuration.configured) return;
    setAuthState("checking");
    try {
      const status = await adminRequest<{ session: AdminSessionView | null }>("/api/admin/auth/session");
      if (status.session === null) {
        setSession(null);
        setCsrfToken(null);
        setAuthState("signed_out");
        return;
      }
      const issued = await adminRequest<{ csrfToken: string; session: AdminSessionView }>("/api/admin/auth/csrf", {
        body: {}, method: "POST"
      });
      setSession(issued.session);
      setCsrfToken(issued.csrfToken);
      setAuthState("signed_in");
    } catch (error) {
      setAuthState("error");
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Admin session check failed" });
    }
  }, [configuration.configured]);

  useEffect(() => { void restoreSession(); }, [restoreSession]);

  const loadInventory = useCallback(async () => {
    if (!configuration.configured || session === null) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (appliedFilters.search !== "") params.set("search", appliedFilters.search);
      if (appliedFilters.brand !== "") params.set("brand", appliedFilters.brand);
      if (appliedFilters.status !== "") params.set("status", appliedFilters.status);
      const response = await adminRequest<{ items: InventoryRecord[]; total: number }>(`/api/admin/inventory?${params}`);
      setRecords(response.items);
      setTotal(response.total);
      setSelectedId((current) => response.items.some(({ item }) => item.inventoryId === current)
        ? current
        : response.items[0]?.item.inventoryId ?? null);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Inventory could not be loaded" });
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, configuration.configured, page, session]);

  useEffect(() => { if (authState === "signed_in") void loadInventory(); }, [authState, loadInventory]);

  const demoFiltered = useMemo(() => demoRecords.filter(({ item }) => {
    if (appliedFilters.brand !== "" && item.brand !== appliedFilters.brand) return false;
    if (appliedFilters.status !== "" && item.custodyStatus !== appliedFilters.status) return false;
    const search = appliedFilters.search.toLocaleLowerCase();
    return search === "" || [item.inventoryId, item.cardName, item.setName, item.cardNumber]
      .some((value) => value.toLocaleLowerCase().includes(search));
  }), [appliedFilters, demoRecords]);

  const visibleRecords = configuration.configured ? records : demoFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const visibleTotal = configuration.configured ? total : demoFiltered.length;
  const selectedRecord = newDraft ?? visibleRecords.find(({ item }) => item.inventoryId === selectedId) ?? null;
  const canEdit = configuration.configured && canEditRole(session?.role);
  const canManage = configuration.configured && canManageRole(session?.role);
  const canQueue = canManage && configuration.onchainQueueConfigured;

  useEffect(() => {
    if (!configuration.configured || session === null || selectedId === null || newDraft !== null) {
      setAuditEvents([]);
      setOperations([]);
      return;
    }
    let active = true;
    setAuditLoading(true);
    Promise.all([
      adminRequest<{ events: InventoryAuditRecord[] }>(`/api/admin/audit?inventoryId=${encodeURIComponent(selectedId)}`),
      adminRequest<{ operations: OnchainQueueRecord[] }>(`/api/admin/inventory/${encodeURIComponent(selectedId)}/onchain-queue`)
    ]).then(([audit, queue]) => {
      if (!active) return;
      setAuditEvents(audit.events);
      setOperations(queue.operations);
    }).catch((error) => {
      if (active) setNotice({ kind: "error", text: error instanceof Error ? error.message : "Audit history could not be loaded" });
    }).finally(() => { if (active) setAuditLoading(false); });
    return () => { active = false; };
  }, [configuration.configured, newDraft, selectedId, session]);

  const runMutation = async (operation: () => Promise<void>) => {
    if (csrfToken === null) return;
    setBusy(true);
    setNotice(null);
    try {
      await operation();
    } catch (error) {
      const suffix = error instanceof AdminClientError && error.code === "REVISION_CONFLICT"
        ? " Refresh the record before retrying."
        : "";
      setNotice({ kind: "error", text: `${error instanceof Error ? error.message : "Admin operation failed"}${suffix}` });
    } finally {
      setBusy(false);
    }
  };

  const saveRecord = async (record: InventoryRecord) => runMutation(async () => {
    const response = record.revision < 0
      ? await adminRequest<{ record: InventoryRecord }>("/api/admin/inventory", { body: { item: record.item }, csrfToken, method: "POST" })
      : await adminRequest<{ record: InventoryRecord }>(`/api/admin/inventory/${encodeURIComponent(record.item.inventoryId)}`, {
          body: { expectedRevision: record.revision, item: record.item }, csrfToken, method: "PATCH"
        });
    setNewDraft(null);
    setSelectedId(response.record.item.inventoryId);
    setNotice({ kind: "success", text: record.revision < 0 ? "Draft inventory record created." : `Revision ${response.record.revision} saved.` });
    await loadInventory();
  });

  const transitionRecord = async (record: InventoryRecord, to: InventoryStatus) => runMutation(async () => {
    const response = await adminRequest<{ record: InventoryRecord }>(
      `/api/admin/inventory/${encodeURIComponent(record.item.inventoryId)}/transition`,
      { body: { expectedRevision: record.revision, to }, csrfToken, method: "POST" }
    );
    setNotice({ kind: "success", text: `Custody advanced to ${formatInventoryStatus(response.record.item.custodyStatus)}.` });
    await loadInventory();
  });

  const deleteRecord = async (record: InventoryRecord) => {
    if (!window.confirm(`Delete draft ${record.item.inventoryId}? This cannot be undone.`)) return;
    await runMutation(async () => {
      await adminRequest(`/api/admin/inventory/${encodeURIComponent(record.item.inventoryId)}`, {
        body: { expectedRevision: record.revision }, csrfToken, method: "DELETE"
      });
      setSelectedId(null);
      setNotice({ kind: "success", text: "Draft inventory record deleted." });
      await loadInventory();
    });
  };

  const queueOperation = async (record: InventoryRecord, action: OnchainQueueAction) => runMutation(async () => {
    const response = await adminRequest<{ operation: OnchainQueueRecord }>(
      `/api/admin/inventory/${encodeURIComponent(record.item.inventoryId)}/onchain-queue`,
      { body: { action, expectedRevision: record.revision }, csrfToken, method: "POST" }
    );
    setOperations((current) => [response.operation, ...current]);
    setNotice({ kind: "success", text: "Operation queued for independent multisig review. No transaction was submitted." });
  });

  const importItems = async (items: unknown[]) => runMutation(async () => {
    const response = await adminRequest<{ count: number }>("/api/admin/inventory/import", {
      body: { items }, csrfToken, method: "POST"
    });
    setNotice({ kind: "success", text: `${response.count} draft records imported.` });
    setPage(0);
    await loadInventory();
  });

  const logout = async () => {
    if (csrfToken !== null) {
      await adminRequest("/api/admin/auth/logout", { body: {}, csrfToken, method: "POST" }).catch(() => undefined);
    }
    setSession(null);
    setCsrfToken(null);
    setRecords([]);
    setAuthState("signed_out");
  };

  const reconciliation = reconcileInventory(visibleRecords.map(({ item }) => item));
  const exportItems = visibleRecords.map(({ item }) => item);

  return (
    <section className={styles.console} aria-label="Admin inventory console">
      <div className={`${styles.modeBanner} ${configuration.configured ? styles.productionMode : styles.demoMode}`} role="status">
        <span>{configuration.configured ? <ShieldCheck aria-hidden="true" size={18} /> : <AlertTriangle aria-hidden="true" size={18} />}</span>
        <div><strong>{configuration.configured ? "Secure server mode" : "Read-only demo mode"}</strong><small>{configuration.reason}</small></div>
        {session !== null ? <div className={styles.sessionIdentity}><code>{session.walletAddress.slice(0, 8)}…{session.walletAddress.slice(-6)}</code><span>{session.role.replace("_", " ")}</span><button aria-label="Sign out of admin console" onClick={() => void logout()} title="Sign out" type="button"><LogOut aria-hidden="true" size={16} /></button></div> : null}
      </div>

      {notice !== null ? <div className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : styles.noticeSuccess}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.kind === "error" ? <XCircle aria-hidden="true" size={17} /> : <CheckCircle2 aria-hidden="true" size={17} />}<span>{notice.text}</span></div> : null}

      {configuration.configured && authState === "checking" ? <div className={`panel ${styles.loadingPanel}`} role="status"><RefreshCw aria-hidden="true" className={styles.spin} size={20} /> Restoring secure admin session…</div> : null}
      {configuration.configured && (authState === "signed_out" || authState === "error") ? <AdminAuthPanel onAuthenticated={(result) => { setSession(result.session); setCsrfToken(result.csrfToken); setAuthState("signed_in"); }} /> : null}

      {!configuration.configured || authState === "signed_in" ? (
        <>
          <section className={`panel ${styles.toolbar}`} aria-label="Inventory filters">
            <form onSubmit={(event) => { event.preventDefault(); setAppliedFilters(filters); setPage(0); }}>
              <label className={styles.searchField}><Search aria-hidden="true" size={17} /><input aria-label="Search inventory" onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search card, set, ID, or certificate" value={filters.search} /></label>
              <label><span>Brand</span><select aria-label="Filter by brand" onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value as InventoryFilters["brand"] }))} value={filters.brand}><option value="">All brands</option>{brands.map((brand) => <option key={brand} value={brand}>{brand.replace("_", " ")}</option>)}</select></label>
              <label><span>Custody</span><select aria-label="Filter by custody status" onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as InventoryFilters["status"] }))} value={filters.status}><option value="">All states</option>{statuses.map((status) => <option key={status} value={status}>{formatInventoryStatus(status)}</option>)}</select></label>
              <button className="secondary-action" type="submit"><Filter aria-hidden="true" size={16} /> Apply</button>
            </form>
            <div className={styles.toolbarActions}>
              <button aria-label="Refresh inventory" className={styles.iconButton} disabled={loading || !configuration.configured} onClick={() => void loadInventory()} title="Refresh" type="button"><RefreshCw aria-hidden="true" className={loading ? styles.spin : undefined} size={17} /></button>
              <button className="primary-action" disabled={!canEdit || busy} onClick={() => { setNewDraft({ item: createDraftInventoryItem(), revision: -1 }); setSelectedId(null); }} type="button"><Plus aria-hidden="true" size={17} /> New intake</button>
            </div>
          </section>

          <div className={styles.workspace}>
            <InventoryRecordTable loading={loading} onPageChange={setPage} onSelect={(id) => { setNewDraft(null); setSelectedId(id); }} page={page} pageSize={PAGE_SIZE} records={visibleRecords} selectedId={selectedId} total={visibleTotal} />
            <InventoryEditor busy={busy} canDelete={canManage} canEdit={canEdit} canQueue={canQueue} onClose={() => { setNewDraft(null); setSelectedId(null); }} onDelete={deleteRecord} onQueue={queueOperation} onSave={saveRecord} onTransition={transitionRecord} record={selectedRecord} />
          </div>

          <section className={`panel ${styles.reconciliation}`} aria-labelledby="reconciliation-title">
            <div className="panel-header compact"><div><span className="eyebrow">Loaded-page audit</span><h2 id="reconciliation-title">Inventory reconciliation</h2></div><span className={`chain-pill reconciliation-pill ${reconciliation.summary}`}>{reconciliation.summary.replace("_", " ")}</span></div>
            <dl>{Object.entries(reconciliation.counts).map(([label, value]) => <div key={label}><dt>{label.replace(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}</dl>
            {reconciliation.issues.length > 0 ? <ul>{reconciliation.issues.slice(0, 8).map((issue) => <li key={issue.id} className={issue.severity === "error" ? styles.issueError : styles.issueWarning}><strong>{issue.label}</strong><small>{issue.detail}</small></li>)}</ul> : <p className={styles.clearState}><CheckCircle2 aria-hidden="true" size={17} /> Loaded records pass deterministic checks.</p>}
          </section>

          <div className={styles.supportGrid}>
            <BulkIntakePanel busy={busy} disabled={!canEdit} onImport={importItems} />
            <InventoryAuditPanel events={auditEvents} loading={auditLoading} operations={operations} selectedInventoryId={selectedRecord !== null && selectedRecord.revision >= 0 ? selectedRecord.item.inventoryId : null} />
            <section className={`panel ${styles.exportPanel}`}><div className="panel-header compact"><div><span className="eyebrow">Current page</span><h2>Inventory exports</h2></div></div><p>Exports contain the validated records currently loaded in the custody ledger.</p><InventoryExportControls csv={toCsv(exportItems)} json={JSON.stringify(exportItems, null, 2)} /></section>
            <section className={`panel ${styles.schemaPanel}`}><div className="panel-header compact"><div><span className="eyebrow">Schema guardrails</span><h2>Required fields</h2></div></div><ul>{requiredFields.map((field) => <li key={field}><code>{field}</code></li>)}</ul></section>
          </div>
        </>
      ) : null}

      <details className={styles.legacyDiagnostics}>
        <summary>Protocol deployment and redemption diagnostics</summary>
        <div><PublicTestnetReadinessPanel /><RedemptionOpsPanel /></div>
      </details>
    </section>
  );
}

function toCsv(items: readonly InventoryItem[]): string {
  if (items.length === 0) return "inventoryId";
  const columns = Object.keys(items[0]!) as (keyof InventoryItem)[];
  const escape = (value: unknown): string => {
    const raw = Array.isArray(value) ? JSON.stringify(value) : value == null ? "" : String(value);
    const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return [columns.join(","), ...items.map((item) => columns.map((column) => escape(item[column])).join(","))].join("\n");
}
