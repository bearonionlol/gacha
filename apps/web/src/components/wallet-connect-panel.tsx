"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Wallet } from "lucide-react";
import {
  type Eip1193Provider,
  formatWalletAddress,
  getInjectedEthereumProvider,
  getWalletErrorMessage,
  readWalletAccounts,
  readWalletChainId,
  requestWalletAccounts,
  robinhoodTestnetChainId,
  switchToRobinhoodTestnet
} from "../lib/contracts/wallet";

export function WalletConnectPanel() {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextProvider = getInjectedEthereumProvider(window);
    let cancelled = false;

    setProvider(nextProvider);
    setIsReady(true);

    if (nextProvider === null) {
      return undefined;
    }

    void Promise.all([
      readWalletAccounts(nextProvider).catch(() => []),
      readWalletChainId(nextProvider).catch(() => null)
    ]).then(([accounts, nextChainId]) => {
      if (!cancelled) {
        setAccount(accounts[0] ?? null);
        setChainId(nextChainId);
        setErrorMessage(null);
      }
    });

    const handleAccountsChanged = (accounts: unknown) => {
      if (!Array.isArray(accounts)) {
        setAccount(null);
        return;
      }

      setAccount(accounts.find((nextAccount): nextAccount is string => typeof nextAccount === "string") ?? null);
    };
    const handleChainChanged = (nextChainId: unknown) => {
      if (typeof nextChainId !== "string") {
        setChainId(null);
        return;
      }

      const parsedChainId = Number.parseInt(nextChainId, 16);
      setChainId(Number.isNaN(parsedChainId) ? null : parsedChainId);
    };

    nextProvider.on?.("accountsChanged", handleAccountsChanged);
    nextProvider.on?.("chainChanged", handleChainChanged);

    return () => {
      cancelled = true;
      nextProvider.removeListener?.("accountsChanged", handleAccountsChanged);
      nextProvider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const compactAddress = useMemo(() => (account === null ? null : formatWalletAddress(account)), [account]);
  const isTargetChain = chainId === robinhoodTestnetChainId;
  const hasWrongChain = account !== null && chainId !== null && !isTargetChain;

  async function handleConnect() {
    if (provider === null) {
      return;
    }

    setIsConnecting(true);
    setErrorMessage(null);

    try {
      const accounts = await requestWalletAccounts(provider);
      setAccount(accounts[0] ?? null);
      setChainId(await readWalletChainId(provider));
    } catch (error) {
      setErrorMessage(getWalletErrorMessage(error));
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSwitchChain() {
    if (provider === null) {
      return;
    }

    setIsSwitching(true);
    setErrorMessage(null);

    try {
      await switchToRobinhoodTestnet(provider);
      setChainId(await readWalletChainId(provider));
    } catch (error) {
      setErrorMessage(getWalletErrorMessage(error));
    } finally {
      setIsSwitching(false);
    }
  }

  if (!isReady) {
    return (
      <div className="wallet-card" aria-label="Wallet connection status">
        <Wallet size={16} aria-hidden="true" />
        <span>Wallet</span>
        <strong>Checking</strong>
      </div>
    );
  }

  if (provider === null) {
    return (
      <div className="wallet-card" aria-label="Wallet connection status">
        <AlertCircle size={16} aria-hidden="true" />
        <span>No wallet detected</span>
        <strong>Read only</strong>
      </div>
    );
  }

  return (
    <div className="wallet-card" aria-label="Wallet connection status">
      {isTargetChain && compactAddress !== null ? (
        <CheckCircle2 size={16} aria-hidden="true" />
      ) : (
        <Wallet size={16} aria-hidden="true" />
      )}
      <span>{compactAddress ?? "Wallet ready"}</span>
      <strong>{compactAddress === null ? "Disconnected" : isTargetChain ? "Robinhood Chain Testnet" : "Wrong chain"}</strong>
      {errorMessage !== null ? <span role="status">{errorMessage}</span> : null}
      {compactAddress === null ? (
        <button className="secondary-action" type="button" onClick={handleConnect} disabled={isConnecting}>
          {isConnecting ? "Connecting" : "Connect wallet"}
        </button>
      ) : null}
      {hasWrongChain ? (
        <button className="secondary-action" type="button" onClick={handleSwitchChain} disabled={isSwitching}>
          {isSwitching ? "Switching" : "Switch to testnet"}
        </button>
      ) : null}
      {compactAddress !== null && chainId !== null && !isTargetChain ? <span>Chain {chainId}</span> : null}
    </div>
  );
}
