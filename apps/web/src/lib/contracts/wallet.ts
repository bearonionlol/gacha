import { robinhoodChainTestnet } from "@gacha/shared";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export const robinhoodTestnetChainId = robinhoodChainTestnet.id;

export function getInjectedEthereumProvider(host?: unknown): Eip1193Provider | null {
  const provider =
    typeof host === "object" && host !== null && "ethereum" in host
      ? (host as { ethereum?: unknown }).ethereum
      : null;

  if (typeof provider !== "object" || provider === null || !("request" in provider)) {
    return null;
  }

  return typeof provider.request === "function" ? (provider as Eip1193Provider) : null;
}

export function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

export function formatWalletAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getRobinhoodAddChainParameters() {
  return {
    chainId: toHexChainId(robinhoodChainTestnet.id),
    chainName: robinhoodChainTestnet.name,
    nativeCurrency: robinhoodChainTestnet.nativeCurrency,
    rpcUrls: robinhoodChainTestnet.rpcUrls.default.http,
    blockExplorerUrls: [robinhoodChainTestnet.blockExplorers.default.url]
  };
}

export async function requestWalletAccounts(provider: Eip1193Provider): Promise<string[]> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  return normalizeAccounts(accounts);
}

export async function readWalletAccounts(provider: Eip1193Provider): Promise<string[]> {
  const accounts = await provider.request({ method: "eth_accounts" });
  return normalizeAccounts(accounts);
}

export async function readWalletChainId(provider: Eip1193Provider): Promise<number | null> {
  const chainId = await provider.request({ method: "eth_chainId" });

  if (typeof chainId !== "string") {
    return null;
  }

  const parsedChainId = Number.parseInt(chainId, 16);
  return Number.isNaN(parsedChainId) ? null : parsedChainId;
}

export async function switchToRobinhoodTestnet(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHexChainId(robinhoodChainTestnet.id) }]
    });
  } catch (error) {
    if (hasProviderErrorCode(error, 4902)) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [getRobinhoodAddChainParameters()]
      });
      return;
    }

    throw error;
  }
}

export function getWalletErrorMessage(error: unknown): string {
  if (hasProviderErrorCode(error, 4001)) {
    return "Connection rejected. You can retry when ready.";
  }

  return "Wallet request failed. Check your wallet and try again.";
}

function normalizeAccounts(accounts: unknown): string[] {
  return Array.isArray(accounts) ? accounts.filter((account): account is string => typeof account === "string") : [];
}

function hasProviderErrorCode(error: unknown, code: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    Number((error as { code: unknown }).code) === code
  );
}
