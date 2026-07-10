import { fireEvent, render, screen } from "@testing-library/react";
import { InventoryExportControls } from "../inventory-export-controls";

describe("InventoryExportControls", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:inventory-export")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads schema-validated JSON with a stable filename", () => {
    let downloadFilename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadFilename = this.download;
    });
    render(<InventoryExportControls csv="inventoryId\n1" json='[{"inventoryId":"1"}]' />);

    fireEvent.click(screen.getByRole("button", { name: /Export JSON/i }));

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(downloadFilename).toBe("gacha-inventory.json");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:inventory-export");
  });

  it("downloads CSV independently from the JSON export", () => {
    let downloadFilename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadFilename = this.download;
    });
    render(<InventoryExportControls csv="inventoryId\n1" json="[]" filenameBase="vault-intake" />);

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));

    expect(downloadFilename).toBe("vault-intake.csv");
  });
});
