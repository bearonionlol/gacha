import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Abi, Address } from "viem";
import { KnownInventoryTokenPicker } from "../known-inventory-token-picker";
import type { ProtocolContracts } from "../../lib/contracts/registry";
import type { TokenReadClient } from "../../lib/contracts/known-inventory-tokens";

const contracts: ProtocolContracts = {
  InventoryRegistry: "0x32657A9d0AFe229E132dA8610a23D6d32d22C4Ee",
  ItemToken: "0x78Cb0aE303a90719F41383E2040D06BBedB2d26d",
  CommitRevealRandomnessProvider: "0xBcD78FfB562cFAeae978Ba38496f042Da6eeB113",
  PackSale: "0x363074770a98a3f8c258148678aFd095c4E5C0Ba",
  Marketplace: "0x2d4Cfd663DDAef48ae4659c09068E842FC31423C",
  BuybackVault: "0x78d0d7C799A6D44085cb4372F1FF6BA49eD224b0",
  Forge: "0x26F77058552b9E69e7d1EE6AADeFeD4BbF555B4B",
  RedemptionRegistry: "0x36C37cb08c78E50a87BB705D6F06EBae11C07451"
};

function setEthereumProvider(request: ReturnType<typeof vi.fn>) {
  Object.defineProperty(window, "ethereum", {
    value: { request },
    configurable: true
  });
}

function createReadClient(): TokenReadClient {
  return {
    readContract: vi.fn(
      async ({
        functionName,
        args
      }: {
        address: Address;
        abi: Abi;
        functionName: string;
        args?: readonly unknown[];
      }) => {
        if (functionName === "derivePhysicalTokenId") {
          return String(args?.[0]) === "inv-sample-pkm-raw-001" ? 1001n : 1002n;
        }

        if (functionName === "balanceOf") {
          return args?.[1] === 1001n ? 1n : 0n;
        }

        return 0n;
      }
    )
  };
}

describe("KnownInventoryTokenPicker", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "ethereum");
  });

  it("does not request wallet accounts on render", () => {
    const request = vi.fn().mockResolvedValue([]);
    setEthereumProvider(request);

    render(<KnownInventoryTokenPicker contracts={contracts} onSelectTokenId={vi.fn()} readClient={createReadClient()} />);

    expect(screen.getByRole("button", { name: /Scan wallet inventory/i })).toBeInTheDocument();
    expect(screen.getAllByText(/known seeded inventory/i).length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalled();
  });

  it("scans known seeded inventory and selects an owned token", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") {
        return "0xb626";
      }
      return null;
    });
    const onSelectTokenId = vi.fn();
    setEthereumProvider(request);

    render(
      <KnownInventoryTokenPicker contracts={contracts} onSelectTokenId={onSelectTokenId} readClient={createReadClient()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /Scan wallet inventory/i }));

    expect(await screen.findByText(/Pokemon TCG Charizard ex/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Use token 1001/i }));

    await waitFor(() => expect(onSelectTokenId).toHaveBeenCalledWith(1001n));
  });
});
