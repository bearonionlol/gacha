import { render, screen } from "@testing-library/react";
import AdminInventoryPage from "../../app/admin/inventory/page";
import ForgePage from "../../app/forge/page";

describe("forge and admin routes", () => {
  it("renders the six-recipe Ascension lab and live settlement controls", () => {
    render(<ForgePage />);

    expect(screen.getByRole("heading", { name: "Recipe book" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Load / })).toHaveLength(6);
    expect(screen.getByRole("heading", { name: "Recast Seal" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Recast Seal 3 by 3 crafting grid/i).children).toHaveLength(9);
    expect(screen.getByRole("region", { name: "Protected Anchor" })).toBeInTheDocument();
    expect(screen.getByText(/never transferred/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Craft result" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live settlement" })).toBeInTheDocument();
    expect(screen.getByLabelText("Vault Forge action")).toBeInTheDocument();
  });

  it("renders admin lifecycle, required fields, and export controls", () => {
    render(<AdminInventoryPage />);

    expect(screen.getByText(/Inventory & Pool Intake/i)).toBeInTheDocument();
    expect(screen.getByText(/inventoryId/i)).toBeInTheDocument();
    expect(screen.getByText(/custodyStatus/i)).toBeInTheDocument();
    expect(screen.getByText(/canonicalCollectibleKey/i)).toBeInTheDocument();
    expect(screen.getAllByText(/forgeTier/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/tierPoolEligible/i)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Inventory intake records/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export JSON/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/i })).toBeInTheDocument();
    expect(screen.getByText(/Public testnet readiness/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Deployment registry/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Mainnet cutover gate/i)).toBeInTheDocument();
    expect(screen.getByText(/Redemption operations/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Request ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Operation mode/i)).toBeInTheDocument();
    expect(screen.getByText(/REDEMPTION_ADMIN_ROLE/i)).toBeInTheDocument();
  });
});
