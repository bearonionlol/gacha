import { render, screen } from "@testing-library/react";
import AdminInventoryPage from "../../app/admin/inventory/page";
import ForgePage from "../../app/forge/page";

describe("forge and admin routes", () => {
  it("renders recipe book, crafting grid, output preview, and grail protection", () => {
    render(<ForgePage />);

    expect(screen.getByText(/Recipe Book/i)).toBeInTheDocument();
    expect(screen.getByText(/3 x 3 Forge Grid/i)).toBeInTheDocument();
    expect(screen.getByText(/Output Preview/i)).toBeInTheDocument();
    expect(screen.getByText(/grail-protected/i)).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(9);
    expect(screen.getByText(/Approval target: Forge/i)).toBeInTheDocument();
    expect(screen.getByText(/Transaction submission lands in Phase 4B/i)).toBeInTheDocument();
  });

  it("renders admin lifecycle, required fields, and export controls", () => {
    render(<AdminInventoryPage />);

    expect(screen.getByText(/Inventory Intake/i)).toBeInTheDocument();
    expect(screen.getByText(/inventoryId/i)).toBeInTheDocument();
    expect(screen.getByText(/custodyStatus/i)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Inventory intake records/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export JSON/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/i })).toBeInTheDocument();
  });
});
