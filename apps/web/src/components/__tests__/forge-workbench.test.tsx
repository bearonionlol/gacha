import { fireEvent, render, screen } from "@testing-library/react";
import ForgePage from "../../app/forge/page";

describe("Forge workbench interactions", () => {
  it("lets users load a recipe, place materials, and recycle duplicates in lab mode", () => {
    render(<ForgePage />);

    fireEvent.click(screen.getByRole("button", { name: /Load Fire Signal Upgrade/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add Fire shard/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add Vault seal/i }));

    expect(screen.getByText(/Fire shard placed/i)).toBeInTheDocument();
    expect(screen.getByText(/Vault seal placed/i)).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 ingredients matched/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Recycle duplicate stack/i }));

    expect(screen.getByText(/Dust balance 23/i)).toBeInTheDocument();
    expect(screen.getByText(/Duplicate stack recycled/i)).toBeInTheDocument();
  });

  it("keeps protected grails out of live craft submission until explicitly unlocked", () => {
    render(<ForgePage />);

    fireEvent.click(screen.getByRole("button", { name: /Live craft/i }));

    expect(screen.getByText(/Protected grails stay locked/i)).toBeInTheDocument();
    expect(screen.getByText(/Lab mode first/i)).toBeInTheDocument();
  });
});
