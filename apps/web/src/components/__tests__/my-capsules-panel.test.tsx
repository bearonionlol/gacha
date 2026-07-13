import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Address } from "viem";

import type { CapsulePurchase } from "../../lib/capsules";
import { MyCapsulesPanel } from "../my-capsules-panel";

const account = "0x4444444444444444444444444444444444444444" as Address;
const transactionHash = `0x${"a".repeat(64)}` as `0x${string}`;

describe("MyCapsulesPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("restores indexed capsules and resumes a pending reveal", async () => {
    const onResume = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      configured: true,
      capsules: [capsule({ purchaseId: "2", status: "pending" }), capsule({
        inventoryId: "inv-op06-case-001",
        purchaseId: "1",
        revealTransactionHash: transactionHash,
        status: "revealed",
        tokenId: "123"
      })]
    }), { status: 200 }));

    render(<MyCapsulesPanel account={account} chainId={46630} onResume={onResume} />);

    expect(await screen.findByText("Capsule 2")).toBeInTheDocument();
    expect(screen.getByText("inv-op06-case-001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Resume reveal/i }));
    expect(onResume).toHaveBeenCalledWith(2n);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(account),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("does not query history until a wallet is connected", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<MyCapsulesPanel account={null} chainId={46630} onResume={vi.fn()} />);

    expect(screen.getByText(/Connect your wallet in the pull controls/i)).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled());
  });
});

function capsule(overrides: Partial<CapsulePurchase>): CapsulePurchase {
  return {
    buyerAddress: account,
    chainId: 46630,
    dropId: "2",
    inventoryId: null,
    priceWei: "10000000000000000",
    purchaseBlockNumber: "100",
    purchaseId: "2",
    purchaseTransactionHash: transactionHash,
    refundTransactionHash: null,
    requestId: `0x${"b".repeat(64)}`,
    revealTransactionHash: null,
    status: "pending",
    tokenId: null,
    ...overrides
  };
}
