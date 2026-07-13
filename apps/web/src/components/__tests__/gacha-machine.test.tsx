import { act, fireEvent, render, screen } from "@testing-library/react";
import { GachaMachine } from "../gacha-machine";

describe("GachaMachine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("turns the physical handle and dispenses a preview capsule", () => {
    vi.useFakeTimers();
    render(<GachaMachine />);

    fireEvent.click(screen.getByRole("button", { name: /Try the gacha machine handle/i }));
    expect(screen.getByText(/Capsules in motion/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1050);
    });

    expect(screen.getByText(/Preview capsule dispensed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Turn again/i })).toBeInTheDocument();
  });

  it("keeps published rewards and live wallet actions in the machine flow", () => {
    render(<GachaMachine />);

    expect(screen.getByText(/Founder's Vault Capsule/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Magic Dust/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reserve capsule/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reveal reserved capsule/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Demo preview/i).length).toBeGreaterThan(0);
  });
});
