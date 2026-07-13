"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Wallet } from "lucide-react";
import { loadChainContextFromEnv, type ChainContext } from "../lib/deployments";
import { switchWalletToChain } from "../lib/contracts/transactions";
import {
  type Eip1193Provider,
  formatWalletAddress,
  getInjectedEthereumProvider,
  getWalletErrorMessage,
  readWalletAccounts,
  readWalletChainId,
  requestWalletAccounts
} from "../lib/contracts/wallet";

export function WalletConnectPanel({ chainContext: suppliedChainContext }: { chainContext?: ChainContext }) {
  const chainContext = useMemo(
    () => suppliedChainContext ?? loadChainContextFromEnv({
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY
    }),
    [suppliedChainContext]
  );
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const nextProvider = getInjectedEthereumProvider(window);
    setProvider(nextProvider);
    setIsReady(true);
    if (nextProvider === null) return () => { active = false; };

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

    void Promise.all([readWalletAccounts(nextProvider), readWalletChainId(nextProvider)]).then(
      ([accounts, connectedChainId]) => {
        if (!active) return;
        handleAccountsChanged(accounts);
        setChainId(connectedChainId);
      },
      () => undefined
    );
    nextProvider.on?.("accountsChanged", handleAccountsChanged);
    nextProvider.on?.("chainChanged", handleChainChanged);

    return () => {
      active = false;
      nextProvider.removeListener?.("accountsChanged", handleAccountsChanged);
      nextProvider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const compactAddress = useMemo(() => (account === null ? null : formatWalletAddress(account)), [account]);
  const isTargetChain = chainId === chainContext.chainId;
  const hasWrongChain = !chainContext.isDemo && account !== null && chainId !== null && !isTargetChain;

  async function handleConnect() {
    if (provider === null) return;
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
    if (provider === null) return;
    setIsSwitching(true);
    setErrorMessage(null);
    try {
      await switchWalletToChain(provider, chainContext);
      setChainId(await readWalletChainId(provider));
    } catch (error) {
      setErrorMessage(getWalletErrorMessage(error));
    } finally {
      setIsSwitching(false);
    }
  }

  if (!isReady) {
    return <div className="wallet-card" aria-label="Wallet connection status"><Wallet size={16} aria-hidden="true" /><span>Wallet</span><strong>Checking</strong></div>;
  }

  if (provider === null) {
    return (
      <div className="wallet-card" aria-label="Wallet connection status">
        <AlertCircle size={16} aria-hidden="true" />
        <span>No wallet detected</span>
        <strong>{chainContext.isDemo ? "Demo available" : "Browsing only"}</strong>
      </div>
    );
  }

  const statusLabel = chainContext.isDemo
    ? "Demo preview"
    : chainContext.isMainnet && !chainContext.writesEnabled
      ? "Mainnet read-only"
    : compactAddress === null
      ? chainContext.chainName
      : isTargetChain
        ? chainContext.chainName
        : "Wrong network";

  return (
    <div className={`wallet-card mode-${chainContext.mode}`} aria-label="Wallet connection status">
      {isTargetChain && compactAddress !== null ? <CheckCircle2 size={16} aria-hidden="true" /> : <Wallet size={16} aria-hidden="true" />}
      <span>{compactAddress ?? (chainContext.isDemo ? "Wallet optional" : "Wallet disconnected")}</span>
      <strong>{statusLabel}</strong>
      {errorMessage !== null ? <span role="status">{errorMessage}</span> : null}
      {compactAddress === null ? (
        <button className="secondary-action" type="button" onClick={handleConnect} disabled={isConnecting}>
          {isConnecting ? "Connecting" : "Connect wallet"}
        </button>
      ) : null}
      {hasWrongChain ? (
        <button className="secondary-action" type="button" onClick={handleSwitchChain} disabled={isSwitching}>
          <RefreshCw size={14} aria-hidden="true" />
          {isSwitching ? "Switching" : chainContext.switchLabel}
        </button>
      ) : null}
      {hasWrongChain ? <span>Connected to chain {chainId}</span> : null}
    </div>
  );
}
