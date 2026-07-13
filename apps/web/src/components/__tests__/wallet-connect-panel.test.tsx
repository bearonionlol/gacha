import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletConnectPanel } from "../wallet-connect-panel";
import { resolveChainContext } from "../../lib/deployments";

const testnetChainContext = resolveChainContext({
  network: "robinhoodTestnet",
  chainId: 46630,
  contracts: {}
});

function setEthereumProvider(provider: unknown) {
  Object.defineProperty(window, "ethereum", {
    value: provider,
    configurable: true
  });
}

describe("WalletConnectPanel", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "ethereum");
  });

  it("renders a missing wallet state without requesting accounts", () => {
    render(<WalletConnectPanel />);

    expect(screen.getByText(/No wallet detected/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect wallet/i })).not.toBeInTheDocument();
  });

  it("restores wallet state silently without requesting access", async () => {
    const request = vi.fn().mockResolvedValue([]);
    setEthereumProvider({ request });

    render(<WalletConnectPanel chainContext={testnetChainContext} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Connect wallet/i })).toBeInTheDocument());
    expect(request).toHaveBeenCalledWith({ method: "eth_accounts" });
    expect(request).toHaveBeenCalledWith({ method: "eth_chainId" });
    expect(request).not.toHaveBeenCalledWith({ method: "eth_requestAccounts" });
  });

  it("connects and shows Robinhood testnet status", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") {
        return [];
      }
      if (method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") {
        return "0xb626";
      }
      return null;
    });
    setEthereumProvider({ request });

    render(<WalletConnectPanel chainContext={testnetChainContext} />);
    fireEvent.click(await screen.findByRole("button", { name: /Connect wallet/i }));

    await waitFor(() => expect(screen.getByText("0x1234...5678")).toBeInTheDocument());
    expect(screen.getByText(/Robinhood Chain Testnet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch to testnet/i })).not.toBeInTheDocument();
  });

  it("shows a rejected connect state and allows retry", async () => {
    const rejected = Object.assign(new Error("User rejected the request."), { code: 4001 });
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") {
        return [];
      }
      if (method === "eth_requestAccounts") {
        throw rejected;
      }
      if (method === "eth_chainId") {
        return "0xb626";
      }
      return null;
    });
    setEthereumProvider({ request });

    render(<WalletConnectPanel chainContext={testnetChainContext} />);
    fireEvent.click(await screen.findByRole("button", { name: /Connect wallet/i }));

    await waitFor(() => expect(screen.getByText(/Connection rejected/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Connect wallet/i })).toBeInTheDocument();
  });

  it("connects and shows a wrong-chain switch action", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") {
        return [];
      }
      if (method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") {
        return "0x1";
      }
      return null;
    });
    setEthereumProvider({ request });

    render(<WalletConnectPanel chainContext={testnetChainContext} />);
    fireEvent.click(await screen.findByRole("button", { name: /Connect wallet/i }));

    await waitFor(() => expect(screen.getByText("0x1234...5678")).toBeInTheDocument());
    expect(screen.getByText(/Wrong network/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Switch to testnet/i })).toBeInTheDocument();
  });

  it("switches to Robinhood testnet only after the switch button is clicked", async () => {
    let chainId = "0x1";
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") {
        return [];
      }
      if (method === "eth_requestAccounts") {
        return ["0x1234567890abcdef1234567890abcdef12345678"];
      }
      if (method === "eth_chainId") {
        return chainId;
      }
      if (method === "wallet_switchEthereumChain") {
        chainId = "0xb626";
        return null;
      }
      return null;
    });
    setEthereumProvider({ request });

    render(<WalletConnectPanel chainContext={testnetChainContext} />);
    fireEvent.click(await screen.findByRole("button", { name: /Connect wallet/i }));

    const switchButton = await screen.findByRole("button", { name: /Switch to testnet/i });
    expect(request).not.toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xb626" }]
    });

    fireEvent.click(switchButton);

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xb626" }]
      })
    );
    await waitFor(() => expect(screen.getByText(/Robinhood Chain Testnet/i)).toBeInTheDocument());
  });
});
