import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address, Hash } from "viem";
import { TransactionActionPanel } from "../transaction-action-panel";
import type { ProtocolContracts } from "../../lib/contracts/registry";
import type { PreparedWrite } from "../../lib/contracts/transactions";

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

const packWrite = {
  address: contracts.PackSale,
  abi: [],
  functionName: "purchase",
  args: [1n],
  value: 9_000_000_000_000_000n
} satisfies PreparedWrite;

function setEthereumProvider(request: ReturnType<typeof vi.fn>) {
  Object.defineProperty(window, "ethereum", {
    value: { request },
    configurable: true
  });
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof TransactionActionPanel>> = {}) {
  const sendWrite = vi.fn().mockResolvedValue(
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hash
  );
  const receiptClient = {
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      blockNumber: 42n,
      status: "success",
      transactionHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hash
    })
  };

  render(
    <TransactionActionPanel
      contracts={contracts}
      ctaLabel="Reserve pack"
      description="Calls PackSale.purchase with the displayed testnet ETH value."
      title="Reserve pack on testnet"
      writeRequest={() => packWrite}
      receiptClient={receiptClient}
      sendWrite={sendWrite}
      {...overrides}
    />
  );

  return { receiptClient, sendWrite };
}

describe("TransactionActionPanel", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "ethereum");
  });

  it("does not request accounts or send transactions on render", async () => {
    const request = vi.fn().mockResolvedValue([]);
    setEthereumProvider(request);
    const { sendWrite } = renderPanel();

    await waitFor(() => expect(screen.getByRole("button", { name: /Connect wallet/i })).toBeInTheDocument());
    expect(request).not.toHaveBeenCalled();
    expect(sendWrite).not.toHaveBeenCalled();
  });

  it("connects only after click and sends only after submit", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") {
        return "0xb626";
      }
      return null;
    });
    setEthereumProvider(request);
    const { sendWrite } = renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /Connect wallet/i }));
    await screen.findByText(/0x1234...5678/i);
    expect(sendWrite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Reserve pack/i }));

    await waitFor(() => expect(sendWrite).toHaveBeenCalledWith(expect.anything(), expect.any(String), packWrite));
  });

  it("renders confirmed receipt details and explorer link", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") {
        return "0xb626";
      }
      return null;
    });
    setEthereumProvider(request);
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /Connect wallet/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Reserve pack/i }));

    await waitFor(() => expect(screen.getByText(/confirmed in block 42/i)).toBeInTheDocument());
    expect(screen.getByText("0x1234...cdef")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View on explorer/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/tx/0x1234567890abcdef")
    );
  });

  it("renders a sanitized rejected state with retry", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") {
        return "0xb626";
      }
      return null;
    });
    const sendWrite = vi.fn().mockRejectedValue(Object.assign(new Error("User denied raw payload"), { code: 4001 }));
    setEthereumProvider(request);
    renderPanel({ sendWrite });

    fireEvent.click(await screen.findByRole("button", { name: /Connect wallet/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Reserve pack/i }));

    await waitFor(() => expect(screen.getByText(/Transaction rejected in wallet/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Retry Reserve pack/i })).toBeInTheDocument();
  });

  it("renders approval and final action controls together", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") {
        return "0xb626";
      }
      return null;
    });
    const approvalWrite = {
      address: contracts.ItemToken,
      abi: [],
      functionName: "setApprovalForAll",
      args: [contracts.Marketplace, true]
    } satisfies PreparedWrite;
    setEthereumProvider(request);
    renderPanel({
      approval: {
        ctaLabel: "Approve Marketplace",
        description: "Approves Marketplace as ERC-1155 operator.",
        writeRequest: () => approvalWrite
      },
      ctaLabel: "List item"
    });

    fireEvent.click(await screen.findByRole("button", { name: /Connect wallet/i }));

    expect(await screen.findByRole("button", { name: /Approve Marketplace/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /List item/i })).toBeInTheDocument();
  });
});
