import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address, Hash, TransactionReceipt } from "viem";
import { TransactionActionPanel } from "../transaction-action-panel";
import type { ProtocolContracts } from "../../lib/contracts/registry";
import type { PreparedWrite } from "../../lib/contracts/transactions";
import { resolveChainContext } from "../../lib/deployments";

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
  value: 10_000_000_000_000_000n
} satisfies PreparedWrite;

const testnetChainContext = resolveChainContext({
  network: "robinhoodTestnet",
  chainId: 46630,
  contracts: {}
});

const unsafeMainnetChainContext = resolveChainContext({
  network: "robinhoodMainnet",
  chainId: 4663,
  randomnessProviderKind: "commit-reveal-demo",
  contracts: {}
});

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
      chainContext={testnetChainContext}
      ctaLabel="Reserve pack"
      description="Calls PackSale.purchase with the displayed ETH value."
      title="Reserve capsule"
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
    window.localStorage.clear();
  });

  it("does not request accounts or send transactions on render", async () => {
    const request = vi.fn().mockResolvedValue([]);
    setEthereumProvider(request);
    const { sendWrite } = renderPanel();

    await waitFor(() => expect(screen.getByRole("button", { name: /Connect wallet/i })).toBeInTheDocument());
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "eth_requestAccounts" }));
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
    expect(screen.getByRole("link", { name: /View on Blockscout/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/tx/0x1234567890abcdef")
    );
  });

  it("treats reverted receipts as failed transactions", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") {
        return "0xb626";
      }
      return null;
    });
    const receiptClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        blockNumber: 42n,
        status: "reverted",
        transactionHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hash
      })
    };
    setEthereumProvider(request);
    renderPanel({ receiptClient });

    fireEvent.click(await screen.findByRole("button", { name: /Connect wallet/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Reserve pack/i }));

    await waitFor(() => expect(screen.getByText(/transaction reverted on-chain/i)).toBeInTheDocument());
    expect(screen.queryByText(/confirmed in block 42/i)).not.toBeInTheDocument();
  });

  it("keeps disabled primary actions from preparing writes", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") {
        return "0xb626";
      }
      return null;
    });
    const writeRequest = vi.fn(() => packWrite);
    setEthereumProvider(request);
    const { sendWrite } = renderPanel({
      actionDisabledReason: "Enter an owned inventory token ID before listing.",
      ctaLabel: "List item",
      writeRequest
    });

    fireEvent.click(await screen.findByRole("button", { name: /Connect wallet/i }));
    const listButton = await screen.findByRole("button", { name: /List item/i });

    expect(listButton).toBeDisabled();
    fireEvent.click(listButton);
    expect(writeRequest).not.toHaveBeenCalled();
    expect(sendWrite).not.toHaveBeenCalled();
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

  it("prevents duplicate submission while a timed-out hash may still settle", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") return "0xb626";
      return null;
    });
    const receiptClient = {
      waitForTransactionReceipt: vi.fn().mockRejectedValue(new Error("Timed out while waiting for receipt"))
    };
    setEthereumProvider(request);
    const { sendWrite } = renderPanel({ receiptClient });

    fireEvent.click(await screen.findByRole("button", { name: /Reserve pack/i }));

    expect(await screen.findByText(/may still settle/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Status unresolved/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Check status/i })).toBeInTheDocument();
    expect(sendWrite).toHaveBeenCalledTimes(1);
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

  it("marks long transaction summary values as breakable metadata", () => {
    renderPanel({
      summary: [{ label: "Function", value: "RedemptionRegistry.requestRedemption" }]
    });

    const functionValue = screen.getByText("RedemptionRegistry.requestRedemption");

    expect(functionValue).toHaveClass("breakable-value");
    expect(functionValue).toHaveAttribute("title", "RedemptionRegistry.requestRedemption");
  });

  it("tracks a repriced replacement by its new hash", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") return "0xb626";
      return null;
    });
    const replacementHash = `0x${"ab".repeat(32)}` as Hash;
    const receiptClient = {
      waitForTransactionReceipt: vi.fn(async (parameters: {
        onReplaced?: (replacement: { reason: "repriced"; transaction: { hash: Hash } }) => void;
      }) => {
        parameters.onReplaced?.({ reason: "repriced", transaction: { hash: replacementHash } });
        return new Promise<never>(() => undefined);
      })
    };
    setEthereumProvider(request);
    renderPanel({ receiptClient });

    fireEvent.click(await screen.findByRole("button", { name: /Reserve pack/i }));

    expect(await screen.findByText(/repriced the transaction/i)).toBeInTheDocument();
    expect(screen.getByText("0xabab...abab")).toBeInTheDocument();
  });

  it("recovers a pending transaction after refresh", async () => {
    const hash = `0x${"12".repeat(32)}` as Hash;
    window.localStorage.setItem(
      "gacha:pending-transaction:46630:reserve-capsule",
      JSON.stringify({ hash, label: "Reserve pack", submittedAt: Date.now() })
    );
    let resolveReceipt!: (value: TransactionReceipt) => void;
    const receiptClient = {
      waitForTransactionReceipt: vi.fn(() => new Promise<TransactionReceipt>((resolve) => {
        resolveReceipt = resolve;
      }))
    };
    renderPanel({ receiptClient });

    expect(await screen.findByText(/Recovered after refresh/i)).toBeInTheDocument();
    resolveReceipt({ blockNumber: 88n, status: "success", transactionHash: hash } as TransactionReceipt);
    expect(await screen.findByText(/Confirmed in block 88/i)).toBeInTheDocument();
    expect(window.localStorage.getItem("gacha:pending-transaction:46630:reserve-capsule")).toBeNull();
  });

  it("blocks every mainnet write when production randomness metadata is unsafe", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") return ["0x1234567890abcdef1234567890abcdef12345678"];
      if (method === "eth_chainId") return "0x1237";
      return null;
    });
    setEthereumProvider(request);
    const { sendWrite } = renderPanel({ chainContext: unsafeMainnetChainContext });

    expect(await screen.findByText(/randomnessProviderKind=pinned-coordinator/i)).toBeInTheDocument();
    expect(sendWrite).not.toHaveBeenCalled();
  });
});
