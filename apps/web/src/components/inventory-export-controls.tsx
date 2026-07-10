"use client";

import { Download, FileJson } from "lucide-react";

type InventoryExportControlsProps = {
  csv: string;
  filenameBase?: string;
  json: string;
};

export function InventoryExportControls({
  csv,
  filenameBase = "gacha-inventory",
  json
}: InventoryExportControlsProps) {
  return (
    <div className="action-grid">
      <button
        className="secondary-action"
        onClick={() => downloadInventory(json, "application/json", `${filenameBase}.json`)}
        type="button"
      >
        <FileJson size={16} aria-hidden="true" />
        Export JSON
      </button>
      <button
        className="secondary-action"
        onClick={() => downloadInventory(csv, "text/csv;charset=utf-8", `${filenameBase}.csv`)}
        type="button"
      >
        <Download size={16} aria-hidden="true" />
        Export CSV
      </button>
    </div>
  );
}

function downloadInventory(content: string, mimeType: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
