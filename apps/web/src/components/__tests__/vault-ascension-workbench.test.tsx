import { fireEvent, render, screen, within } from "@testing-library/react";
import { VaultAscensionWorkbench } from "../vault-ascension-workbench";

describe("Vault Ascension workbench", () => {
  it("shows all six blueprints in clear recipe groups and loads a selected blueprint", () => {
    render(<VaultAscensionWorkbench />);

    expect(screen.getByRole("heading", { name: "Swap" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ascend" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Refine" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Load / })).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "Load Ascension Seal" }));

    expect(screen.getByRole("heading", { name: "Ascension Seal" })).toBeInTheDocument();
    expect(screen.getByText("1 random Tier III card")).toBeInTheDocument();
    expect(screen.getByText(/Next tier · inventory-backed random reveal/i)).toBeInTheDocument();
  });

  it("auto-fills an Ascension seal after two explicit duplicate selections", () => {
    render(<VaultAscensionWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Load Ascension Seal" }));
    fireEvent.click(screen.getByRole("button", { name: /Select trade-in Charizard ex Double Rare/i }));
    fireEvent.click(screen.getByRole("button", { name: /Select trade-in Ninetales ex Ultra Rare/i }));
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill Ascension" }));

    expect(screen.getByText("Blueprint matched")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove Charizard ex Double Rare from cell 7/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove Ninetales ex Ultra Rare from cell 9/i })).toBeInTheDocument();
    expect(screen.getByText("Lab recipe complete")).toBeInTheDocument();
  });

  it("uses Star Dust to turn Guided Recast into a two-card choice", () => {
    render(<VaultAscensionWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Load Guided Recast" }));
    fireEvent.click(screen.getByRole("button", { name: /Select trade-in Charizard ex Double Rare/i }));
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill Guided Recast" }));

    expect(screen.getByRole("button", { name: /Remove Star Dust from cell 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove Star Dust from cell 3/i })).toBeInTheDocument();
    expect(screen.getByText("Choose 1 of 2 Tier II cards")).toBeInTheDocument();
    expect(screen.getByText(/Two reserved candidates · choose one/i)).toBeInTheDocument();
  });

  it("keeps the selected Anchor protected and outside the trade-in inventory", () => {
    render(<VaultAscensionWorkbench />);

    const anchorSelect = screen.getByLabelText("Select protected Anchor");
    fireEvent.change(anchorSelect, { target: { value: "anchor-luffy" } });

    const anchorRegion = screen.getByRole("region", { name: "Protected Anchor" });
    expect(within(anchorRegion).getByText("Monkey.D.Luffy Parallel Art")).toBeInTheDocument();
    expect(within(anchorRegion).getByText(/never transferred/i)).toBeInTheDocument();
    expect(screen.getByText("Retained", { selector: "dd" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /trade-in Lugia V Alternate Art/i })).not.toBeInTheDocument();
  });

  it("warns clearly when a duplicate is marked for protocol custody", () => {
    render(<VaultAscensionWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: /Select trade-in Charizard ex Double Rare/i }));

    const warning = screen.getByRole("alert");
    expect(within(warning).getByText("Trade-in warning")).toBeInTheDocument();
    expect(within(warning).getByText(/transfer into claim-specific protocol custody when the live craft is submitted/i)).toBeInTheDocument();
    expect(within(warning).getByText(/return if randomness expires/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove Charizard ex Double Rare from cell 8/i })).toBeInTheDocument();
  });

  it("refines three matching Dust into the chosen Dust without a card trade-in", () => {
    render(<VaultAscensionWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Load Dust Exchange" }));
    fireEvent.change(screen.getByLabelText("Receive Dust"), { target: { value: "star" } });
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill Dust Exchange" }));

    expect(screen.getByText("Blueprint matched")).toBeInTheDocument();
    expect(screen.getByText("1 Star Dust")).toBeInTheDocument();
    expect(screen.getByText(/deterministic refinement/i)).toBeInTheDocument();
    expect(screen.getByText(/This blueprint spends Dust only/i)).toBeInTheDocument();
    const cost = screen.getByRole("region", { name: "Grid cost" });
    expect(within(cost).getByText("5")).toBeInTheDocument();
    expect(within(cost).getByText("3")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
