"use client";

import { FileJson, LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";

import styles from "../../../app/admin/inventory/admin-inventory.module.css";

export function BulkIntakePanel(props: {
  busy: boolean;
  disabled: boolean;
  onImport: (items: unknown[]) => Promise<void>;
}) {
  const [payload, setPayload] = useState("");
  const [error, setError] = useState<string | null>(null);

  const readFile = async (file: File | undefined) => {
    if (file === undefined) return;
    if (file.size > 2_000_000) {
      setError("Import files must be smaller than 2 MB.");
      return;
    }
    setPayload(await file.text());
    setError(null);
  };

  const submit = async () => {
    setError(null);
    try {
      const parsed: unknown = JSON.parse(payload);
      const items = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" && parsed !== null && "items" in parsed && Array.isArray((parsed as { items: unknown }).items)
          ? (parsed as { items: unknown[] }).items
          : null;
      if (items === null) throw new Error("JSON must be an inventory array or an object with an items array.");
      await props.onImport(items);
      setPayload("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import file could not be read");
    }
  };

  return (
    <section className={`panel ${styles.bulkPanel}`} aria-labelledby="bulk-intake-title">
      <div className="panel-header compact">
        <div><span className="eyebrow">Validated batch</span><h2 id="bulk-intake-title">Bulk intake</h2></div>
        <FileJson aria-hidden="true" size={19} />
      </div>
      <p>Imports are atomic, limited to 200 records, and always enter as ineligible drafts.</p>
      <label className={styles.filePicker}>
        <Upload aria-hidden="true" size={17} />
        <span>Choose JSON file</span>
        <input accept="application/json,.json" disabled={props.disabled || props.busy} onChange={(event) => void readFile(event.target.files?.[0])} type="file" />
      </label>
      <label className={styles.payloadField}><span>Import payload</span><textarea disabled={props.disabled || props.busy} onChange={(event) => setPayload(event.target.value)} placeholder='[{ "inventoryId": "inv-..." }]' rows={7} value={payload} /></label>
      <button className="secondary-action" disabled={props.disabled || props.busy || payload.trim() === ""} onClick={() => void submit()} type="button">
        {props.busy ? <LoaderCircle aria-hidden="true" className={styles.spin} size={16} /> : <Upload aria-hidden="true" size={16} />} Import drafts
      </button>
      {error !== null ? <p className={styles.errorText} role="alert">{error}</p> : null}
    </section>
  );
}
