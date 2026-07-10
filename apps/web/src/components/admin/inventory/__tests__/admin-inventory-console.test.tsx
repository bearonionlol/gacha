import { fireEvent, render, screen } from "@testing-library/react";
import { sampleInventory } from "@gacha/inventory";

import { AdminInventoryConsole } from "../../../admin-inventory-console";

const demoRecords = sampleInventory.map((item) => ({ item, revision: 0 }));

describe("AdminInventoryConsole", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps unconfigured servers useful but strictly read-only", () => {
    render(<AdminInventoryConsole
      configuration={{ configured: false, mode: "demo_readonly", onchainQueueConfigured: false, reason: "Read-only demo mode." }}
      demoRecords={demoRecords}
    />);

    expect(screen.getByText("Read-only demo mode")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New intake/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Import drafts/i })).toBeDisabled();
    expect(screen.getByRole("table", { name: /Inventory intake records/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: /Search inventory/i }), { target: { value: "Lugia" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply/i }));
    expect(screen.getByText(/Lugia V Alternate Art/i)).toBeInTheDocument();
    expect(screen.queryByText(/Charizard ex/i)).not.toBeInTheDocument();
  });

  it("does not expose demo inventory while a configured server is signed out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ session: null }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    })));
    render(<AdminInventoryConsole
      configuration={{ configured: true, mode: "production", onchainQueueConfigured: false, reason: "Secure off-chain inventory operations are configured." }}
      demoRecords={demoRecords}
    />);

    expect(await screen.findByRole("heading", { name: /Admin wallet sign-in/i })).toBeInTheDocument();
    expect(screen.queryByText(/Charizard ex/i)).not.toBeInTheDocument();
  });
});
