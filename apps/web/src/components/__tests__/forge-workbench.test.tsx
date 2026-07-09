import { fireEvent, render, screen, within } from "@testing-library/react";
import ForgePage from "../../app/forge/page";

describe("Vault Ascension route interactions", () => {
  it("completes a Recast Seal with Dust and a custody trade-in", () => {
    render(<ForgePage />);

    fireEvent.click(screen.getByRole("button", { name: /Select trade-in Charizard ex Double Rare/i }));
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill Recast" }));

    expect(screen.getByText("Blueprint matched")).toBeInTheDocument();
    expect(screen.getByText("1 different Tier II card")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/claim-specific protocol custody/i);
    expect(screen.getByRole("button", { name: "Open live settlement" })).toBeEnabled();
  });

  it("turns Star Dust into a bounded guided ascension choice", () => {
    render(<ForgePage />);

    fireEvent.click(screen.getByRole("button", { name: "Load Guided Ascension" }));
    fireEvent.click(screen.getByRole("button", { name: /Select trade-in Charizard ex Double Rare/i }));
    fireEvent.click(screen.getByRole("button", { name: /Select trade-in Ninetales ex Ultra Rare/i }));
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill Guided Ascension" }));

    expect(screen.getByText("Choose 1 of 3 Tier III cards")).toBeInTheDocument();
    expect(screen.getByText(/Three reserved candidates/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Remove Star Dust from cell/i })).toHaveLength(2);
    const cost = screen.getByRole("region", { name: "Grid cost" });
    expect(within(cost).getByText("20")).toBeInTheDocument();
    expect(within(cost).getByText("12")).toBeInTheDocument();
    expect(within(cost).getByText("8")).toBeInTheDocument();
    expect(within(cost).getByText("6")).toBeInTheDocument();
  });

  it("keeps the Anchor visibly retained while trade-ins are transferred", () => {
    render(<ForgePage />);

    fireEvent.change(screen.getByLabelText("Select protected Anchor"), {
      target: { value: "anchor-luffy" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Load Ascension Seal" }));

    const anchor = screen.getByRole("region", { name: "Protected Anchor" });
    expect(within(anchor).getByText("Monkey.D.Luffy Parallel Art")).toBeInTheDocument();
    expect(within(anchor).getByText(/never transferred/i)).toBeInTheDocument();
    expect(screen.getByText("Retained", { selector: "dd" })).toBeInTheDocument();
  });

  it("provides a deterministic Dust refinement and live V4 transaction surface", () => {
    render(<ForgePage />);

    fireEvent.click(screen.getByRole("button", { name: "Load Dust Exchange" }));
    fireEvent.change(screen.getByLabelText("Receive Dust"), { target: { value: "star" } });
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill Dust Exchange" }));

    expect(screen.getByText("1 Star Dust")).toBeInTheDocument();
    expect(screen.getByText(/deterministic refinement/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live settlement" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Vault Forge action"), { target: { value: "exchange" } });
    expect(screen.getByText(/Dust Exchange is deterministic/i)).toBeInTheDocument();
    expect(screen.getByText("Echo -> Prism")).toBeInTheDocument();
  });
});
