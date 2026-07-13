"use client";

import type { InventoryItem, InventoryStatus } from "@gacha/inventory";
import { ArrowRight, DatabaseZap, FileLock2, Save, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import styles from "../../../app/admin/inventory/admin-inventory.module.css";
import { categories, getManualNextStatuses, grailTiers, onchainManagedStatuses, brands, formatInventoryStatus } from "./model";
import type { InventoryRecord, OnchainQueueAction } from "./types";

type InventoryEditorProps = {
  busy: boolean;
  canDelete: boolean;
  canEdit: boolean;
  canQueue: boolean;
  onClose: () => void;
  onDelete: (record: InventoryRecord) => Promise<void>;
  onQueue: (record: InventoryRecord, action: OnchainQueueAction) => Promise<void>;
  onSave: (record: InventoryRecord) => Promise<void>;
  onTransition: (record: InventoryRecord, to: InventoryStatus) => Promise<void>;
  record: InventoryRecord | null;
};

const centsToDollars = (cents: number): string => (cents / 100).toFixed(2);
const dollarsToCents = (value: string): number => Math.max(0, Math.round((Number(value) || 0) * 100));

export function InventoryEditor(props: InventoryEditorProps) {
  const [form, setForm] = useState<InventoryItem | null>(props.record?.item ?? null);
  useEffect(() => setForm(props.record?.item ?? null), [props.record]);

  const isNew = (props.record?.revision ?? 0) < 0;
  const indexed = form !== null && onchainManagedStatuses.has(form.custodyStatus);
  const nextStatuses = useMemo(() => form === null ? [] : getManualNextStatuses(form.custodyStatus), [form]);

  if (props.record === null || form === null) {
    return (
      <aside className={`panel ${styles.editorPanel} ${styles.editorEmpty}`} aria-label="Inventory item details">
        <DatabaseZap aria-hidden="true" size={25} />
        <strong>Select an inventory record</strong>
        <span>Custody details, revisions, lifecycle controls, and audit history appear here.</span>
      </aside>
    );
  }

  const update = <Key extends keyof InventoryItem>(key: Key, value: InventoryItem[Key]) => {
    setForm((current) => current === null ? current : { ...current, [key]: value });
  };
  const saveRecord = { ...props.record, item: form };
  const readOnly = !props.canEdit || indexed;

  return (
    <aside className={`panel ${styles.editorPanel}`} aria-labelledby="inventory-editor-title">
      <div className={styles.editorHeader}>
        <div>
          <span className="eyebrow">{isNew ? "Draft intake" : `Revision ${props.record.revision}`}</span>
          <h2 id="inventory-editor-title">{isNew ? "New inventory record" : form.cardName}</h2>
          <code>{form.inventoryId}</code>
        </div>
        <button aria-label="Close inventory details" className={styles.iconButton} onClick={props.onClose} title="Close" type="button"><X aria-hidden="true" size={18} /></button>
      </div>

      {indexed ? (
        <div className={styles.indexedNotice}><FileLock2 aria-hidden="true" size={17} /><span><strong>Indexed custody state</strong> Metadata is read-only and must be reconciled from contract events.</span></div>
      ) : null}

      <form className={styles.editorForm} onSubmit={(event) => { event.preventDefault(); void props.onSave(saveRecord); }}>
        <fieldset disabled={readOnly || props.busy}>
          <legend>Identity</legend>
          <div className={styles.formGrid}>
            <label className={styles.spanTwo}><span>Inventory ID</span><input disabled={!isNew} required value={form.inventoryId} onChange={(event) => update("inventoryId", event.target.value)} /></label>
            <label><span>Brand</span><select value={form.brand} onChange={(event) => update("brand", event.target.value as InventoryItem["brand"])}>{brands.map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select></label>
            <label><span>Category</span><select value={form.category} onChange={(event) => update("category", event.target.value as InventoryItem["category"])}>{categories.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
            <label className={styles.spanTwo}><span>Card or product name</span><input required value={form.cardName} onChange={(event) => update("cardName", event.target.value)} /></label>
            <label><span>Set</span><input required value={form.setName} onChange={(event) => update("setName", event.target.value)} /></label>
            <label><span>Card number</span><input value={form.cardNumber} onChange={(event) => update("cardNumber", event.target.value)} /></label>
            <label><span>Language</span><input required value={form.language} onChange={(event) => update("language", event.target.value)} /></label>
            <label><span>Edition</span><input value={form.edition} onChange={(event) => update("edition", event.target.value)} /></label>
            <label className={styles.spanTwo}><span>Variant</span><input value={form.variant} onChange={(event) => update("variant", event.target.value)} /></label>
          </div>
        </fieldset>

        <fieldset disabled={readOnly || props.busy}>
          <legend>Condition &amp; grading</legend>
          <div className={styles.formGrid}>
            <label><span>Raw condition</span><input value={form.rawConditionEstimate} onChange={(event) => update("rawConditionEstimate", event.target.value)} /></label>
            <label><span>Grading company</span><input value={form.gradingCompany ?? ""} onChange={(event) => update("gradingCompany", event.target.value || null)} /></label>
            <label><span>Grade</span><input value={form.grade ?? ""} onChange={(event) => update("grade", event.target.value || null)} /></label>
            <label><span>Certificate number</span><input value={form.certNumber ?? ""} onChange={(event) => update("certNumber", event.target.value || null)} /></label>
            <label className={styles.spanTwo}><span>Certificate URL</span><input inputMode="url" value={form.certUrl ?? ""} onChange={(event) => update("certUrl", event.target.value || null)} /></label>
            <label className={styles.spanTwo}><span>Condition notes</span><textarea rows={3} value={form.conditionNotes} onChange={(event) => update("conditionNotes", event.target.value)} /></label>
          </div>
        </fieldset>

        <fieldset disabled={readOnly || props.busy}>
          <legend>Custody &amp; value</legend>
          <div className={styles.formGrid}>
            <label className={styles.spanTwo}><span>Photo URLs · one per line</span><textarea rows={3} value={form.photoUrls.join("\n")} onChange={(event) => update("photoUrls", event.target.value.split("\n").map((value) => value.trim()).filter(Boolean))} /></label>
            <label className={styles.spanTwo}><span>Vault location</span><input value={form.vaultLocationLabel} onChange={(event) => update("vaultLocationLabel", event.target.value)} /></label>
            <label><span>Market estimate · USD</span><input min="0" step="0.01" type="number" value={centsToDollars(form.marketEstimateCents)} onChange={(event) => update("marketEstimateCents", dollarsToCents(event.target.value))} /></label>
            <label><span>Buyback quote · USD</span><input min="0" step="0.01" type="number" value={centsToDollars(form.buybackQuoteCents)} onChange={(event) => update("buybackQuoteCents", dollarsToCents(event.target.value))} /></label>
            <label><span>Grail protection</span><select value={form.grailTier} onChange={(event) => update("grailTier", event.target.value as InventoryItem["grailTier"])}>{grailTiers.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Forge tier</span><select value={form.forgeTier} onChange={(event) => update("forgeTier", Number(event.target.value) as InventoryItem["forgeTier"])}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>Tier {value}</option>)}</select></label>
          </div>
          <div className={styles.checkGrid}>
            <label><input checked={form.redeemable} onChange={(event) => update("redeemable", event.target.checked)} type="checkbox" /> Redeemable</label>
            <label><input checked={form.tradeInEligible} onChange={(event) => update("tradeInEligible", event.target.checked)} type="checkbox" /> Trade-in eligible</label>
            <label><input checked={form.tierPoolEligible} onChange={(event) => update("tierPoolEligible", event.target.checked)} type="checkbox" /> Tier-pool eligible</label>
            <label><input checked={form.dropEligibility} onChange={(event) => update("dropEligibility", event.target.checked)} type="checkbox" /> Drop eligible</label>
          </div>
        </fieldset>

        <fieldset disabled={readOnly || props.busy}>
          <legend>Forge policy &amp; provenance</legend>
          <div className={styles.formGrid}>
            <label className={styles.spanTwo}><span>Canonical collectible key</span><input required value={form.canonicalCollectibleKey} onChange={(event) => update("canonicalCollectibleKey", event.target.value)} /></label>
            <label className={styles.spanTwo}><span>Forge set key</span><input required value={form.forgeSetKey} onChange={(event) => update("forgeSetKey", event.target.value)} /></label>
            <label className={styles.spanTwo}><span>Crafting tags · comma separated</span><input value={form.craftingTags.join(", ")} onChange={(event) => update("craftingTags", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} /></label>
            <label className={styles.spanTwo}><span>Legal disclaimer</span><textarea required rows={3} value={form.legalDisclaimer} onChange={(event) => update("legalDisclaimer", event.target.value)} /></label>
          </div>
        </fieldset>

        <div className={styles.editorActions}>
          <button className="primary-action" disabled={readOnly || props.busy} type="submit"><Save aria-hidden="true" size={16} /> {isNew ? "Create draft" : "Save revision"}</button>
          {!isNew && props.canDelete && form.custodyStatus === "draft" ? <button className={styles.dangerButton} disabled={props.busy} onClick={() => void props.onDelete(props.record!)} type="button"><Trash2 aria-hidden="true" size={16} /> Delete draft</button> : null}
        </div>
      </form>

      {!isNew ? (
        <section className={styles.lifecycleSection} aria-labelledby="lifecycle-title">
          <div><span className="eyebrow">Controlled custody</span><h3 id="lifecycle-title">Lifecycle</h3></div>
          <div className={styles.lifecycleCurrent}><span>{formatInventoryStatus(form.custodyStatus)}</span>{nextStatuses.map((status) => <button disabled={!props.canEdit || props.busy} key={status} onClick={() => void props.onTransition(props.record!, status)} type="button"><ArrowRight aria-hidden="true" size={15} /> {formatInventoryStatus(status)}</button>)}</div>
          {form.custodyStatus === "drop_ready" ? <p>Tokenized and ownership states are set only by indexed contract events.</p> : null}
        </section>
      ) : null}

      {!isNew ? (
        <section className={styles.queueSection} aria-labelledby="queue-title">
          <div><span className="eyebrow">Multisig handoff</span><h3 id="queue-title">Production operation queue</h3></div>
          <p>Requests are immutable and off-chain. A separate multisig workflow must simulate, approve, and execute them.</p>
          <div className={styles.queueActions}>
            <button disabled={!props.canQueue || props.busy || !["verified", "vaulted", "drop_ready"].includes(form.custodyStatus)} onClick={() => void props.onQueue(props.record!, "anchor_metadata")} type="button"><Send aria-hidden="true" size={16} /> Queue metadata anchor</button>
            <button disabled={!props.canQueue || props.busy || form.custodyStatus !== "drop_ready" || !form.dropEligibility} onClick={() => void props.onQueue(props.record!, "publish_drop")} type="button"><Send aria-hidden="true" size={16} /> Queue drop publication</button>
          </div>
        </section>
      ) : null}
    </aside>
  );
}
