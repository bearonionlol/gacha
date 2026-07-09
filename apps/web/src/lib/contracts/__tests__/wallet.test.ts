import { describe, expect, it, vi } from "vitest";
import {
  formatWalletAddress,
  getInjectedEthereumProvider,
  getRobinhoodAddChainParameters,
  getWalletErrorMessage,
  requestWalletAccounts,
  switchToRobinhoodTestnet,
  toHexChainId
} from "../wallet";

describe("wallet helpers", () => {
  it("returns null when no injected wallet is available", () => {
    expect(getInjectedEthereumProvider({})).toBeNull();
  });

  it("formats addresses for compact UI", () => {
    expect(formatWalletAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234...5678");
  });

  it("formats decimal chain IDs as wallet hex IDs", () => {
    expect(toHexChainId(46630)).toBe("0xb626");
  });

  it("builds Robinhood testnet add-chain params from the shared chain config", () => {
    const params = getRobinhoodAddChainParameters();

    expect(params.chainId).toBe("0xb626");
    expect(params.chainName).toBe("Robinhood Chain Testnet");
    expect(params.rpcUrls).toEqual(["https://rpc.testnet.chain.robinhood.com"]);
  });

  it("requests wallet accounts only through the provider request method", async () => {
    const provider = {
      request: vi.fn().mockResolvedValue(["0x1234567890abcdef1234567890abcdef12345678"])
    };

    await expect(requestWalletAccounts(provider)).resolves.toEqual([
      "0x1234567890abcdef1234567890abcdef12345678"
    ]);
    expect(provider.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
  });

  it("reports a rejected connect request without masking the provider error", async () => {
    const error = Object.assign(new Error("User rejected the request."), { code: 4001 });
    const provider = {
      request: vi.fn().mockRejectedValue(error)
    };

    await expect(requestWalletAccounts(provider)).rejects.toBe(error);
    expect(getWalletErrorMessage(error)).toBe("Connection rejected. You can retry when ready.");
  });

  it("requests a switch to Robinhood Chain Testnet", async () => {
    const provider = {
      request: vi.fn().mockResolvedValue(null)
    };

    await switchToRobinhoodTestnet(provider);

    expect(provider.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xb626" }]
    });
  });

  it("falls back to adding Robinhood Chain Testnet when the wallet does not know the chain", async () => {
    const unknownChainError = Object.assign(new Error("Unknown chain"), { code: 4902 });
    const provider = {
      request: vi.fn().mockRejectedValueOnce(unknownChainError).mockResolvedValueOnce(null)
    };

    await switchToRobinhoodTestnet(provider);

    expect(provider.request).toHaveBeenNthCalledWith(1, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xb626" }]
    });
    expect(provider.request).toHaveBeenNthCalledWith(2, {
      method: "wallet_addEthereumChain",
      params: [getRobinhoodAddChainParameters()]
    });
  });
});
