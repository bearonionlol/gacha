import { render, screen } from "@testing-library/react";
import AdminInventoryPage from "../../app/admin/inventory/page";
import ForgePage from "../../app/forge/page";

describe("forge and admin routes", () => {
  it("renders recipe book, crafting grid, output preview, and grail protection", () => {
    render(<ForgePage />);

    expect(screen.getByText(/Recipe Book/i)).toBeInTheDocument();
    expect(screen.getByText(/Discovery recipes/i)).toBeInTheDocument();
    expect(screen.getByText(/Material bank/i)).toBeInTheDocument();
    expect(screen.getByText(/Duplicate recycler/i)).toBeInTheDocument();
    expect(screen.getByText(/Lab mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Live craft/i)).toBeInTheDocument();
    expect(screen.getByText(/3 x 3 Forge Grid/i)).toBeInTheDocument();
    expect(screen.getByText(/Output Preview/i)).toBeInTheDocument();
    expect(screen.getByText(/Protocol fee preview/i)).toBeInTheDocument();
    expect(screen.getByText(/Provenance log/i)).toBeInTheDocument();
    expect(screen.getByText(/grail-protected/i)).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(9);
    expect(screen.getByText(/Approve Forge/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Forge\.craft/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/0\.001 ETH/i)).toBeInTheDocument();
  });

  it("renders admin lifecycle, required fields, and export controls", () => {
    render(<AdminInventoryPage />);

    expect(screen.getByText(/Inventory Intake/i)).toBeInTheDocument();
    expect(screen.getByText(/inventoryId/i)).toBeInTheDocument();
    expect(screen.getByText(/custodyStatus/i)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Inventory intake records/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export JSON/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/i })).toBeInTheDocument();
    expect(screen.getByText(/Redemption operations/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Request ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Operation mode/i)).toBeInTheDocument();
    expect(screen.getByText(/REDEMPTION_ADMIN_ROLE/i)).toBeInTheDocument();
  });
});
