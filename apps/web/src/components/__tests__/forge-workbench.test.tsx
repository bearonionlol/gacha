import { fireEvent, render, screen } from "@testing-library/react";
import ForgePage from "../../app/forge/page";

describe("Forge workbench interactions", () => {
  it("matches the paid Fire Signal blueprint before enabling live craft", () => {
    render(<ForgePage />);

    fireEvent.click(screen.getByRole("button", { name: /Load Fire Signal/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add Fire shard/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add Vault seal/i }));

    expect(screen.getByText(/Placed Fire shard/i)).toBeInTheDocument();
    expect(screen.getByText(/Placed Vault seal/i)).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 matched/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add Forge dust/i }));
    fireEvent.click(screen.getByRole("button", { name: /Live craft/i }));

    expect(screen.getByText(/Blueprint matched/i)).toBeInTheDocument();
    expect(screen.getByText(/Forge\.craftWithImprint/i)).toBeInTheDocument();
    expect(screen.getAllByText(/0\.001 ETH/i).length).toBeGreaterThan(0);
  });

  it("turns the duplicate recycler into a bounded on-chain blueprint", () => {
    render(<ForgePage />);

    fireEvent.click(screen.getAllByRole("button", { name: /Load Duplicate Recycler/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Add Fire shard/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add Fire shard/i }));

    expect(screen.getByText(/2 of 2 matched/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Forge dust x1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
  });

  it("uses physical cards only as retained catalysts and changes the provenance imprint", () => {
    const { container } = render(<ForgePage />);

    const before = container.querySelector(".forge-imprint-hash")?.textContent;
    fireEvent.change(screen.getByLabelText(/Inscription/i), { target: { value: "MY VAULT" } });
    const after = container.querySelector(".forge-imprint-hash")?.textContent;
    fireEvent.click(screen.getByRole("button", { name: /Load Vault Resonance/i }));

    expect(after).not.toBe(before);
    expect(screen.getByText(/held, never burned/i)).toBeInTheDocument();
    expect(screen.getByText(/wallet check/i)).toBeInTheDocument();
  });
});
