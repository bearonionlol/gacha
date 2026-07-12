"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { PackageCheck, Search, Store, Wallet } from "lucide-react";
import {
  readKnownInventoryTokenStates,
  type KnownInventoryToken,
  type KnownInventoryTokenScan,
  type TokenReadClient
} from "../lib/contracts/known-inventory-tokens";
import { createRobinhoodPublicClient } from "../lib/contracts/public-client";
import type { ProtocolContracts } from "../lib/contracts/registry";
import {
  type Eip1193Provider,
  formatWalletAddress,
  getInjectedEthereumProvider,
  getWalletErrorMessage,
  readWalletChainId,
  requestWalletAccounts,
  robinhoodTestnetChainId
} from "../lib/contracts/wallet";

type KnownInventoryTokenPickerProps = {
  contracts: ProtocolContracts | null;
  onSelectTokenId?: (tokenId: bigint) => void;
  readClient?: TokenReadClient;
  registryMessage?: string;
  requireRedeemable?: boolean;
  mode?: "select" | "vault";
};

type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "ready"; account: Address; scan: KnownInventoryTokenScan }
  | { status: "failed"; message: string };

export function KnownInventoryTokenPicker({
  contracts,
  mode = "select",
  onSelectTokenId,
  readClient,
  registryMessage = "Live contracts are not configured for this environment.",
  requireRedeemable = false
}: KnownInventoryTokenPickerProps) {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ status: "idle" });

  useEffect(() => {
    setProvider(getInjectedEthereumProvider(window));
  }, []);

  const tokens = useMemo(() => {
    if (scanState.status !== "ready") {
      return [];
    }

    return requireRedeemable ? scanState.scan.tokens.filter((token) => token.redeemable) : scanState.scan.tokens;
  }, [requireRedeemable, scanState]);

  async function handleScan() {
    if (contracts === null) {
      setScanState({ status: "failed", message: registryMessage });
      return;
    }

    if (provider === null) {
      setScanState({ status: "failed", message: "Open an EVM wallet such as Phantom or MetaMask to scan testnet inventory." });
      return;
    }

    setScanState({ status: "scanning" });

    try {
      const accounts = await requestWalletAccounts(provider);
      const account = accounts[0] as Address | undefined;

      if (account === undefined) {
        setScanState({ status: "failed", message: "Connect a wallet before scanning known inventory." });
        return;
      }

      const chainId = await readWalletChainId(provider);
      if (chainId !== robinhoodTestnetChainId) {
        setScanState({ status: "failed", message: "Switch wallet to Robinhood Chain Testnet before scanning inventory." });
        return;
      }

      const scan = await readKnownInventoryTokenStates({
        account,
        contracts,
        client: readClient ?? createRobinhoodPublicClient()
      });
      setScanState({ status: "ready", account, scan });
    } catch (error) {
      setScanState({ status: "failed", message: getWalletErrorMessage(error) });
    }
  }

  return (
    <aside className="known-token-picker" aria-label="Known inventory token picker">
      <div className="transaction-state-row">
        <div>
          <span className="eyebrow">Known inventory</span>
          <strong>{mode === "vault" ? "Connected wallet holdings" : "Wallet token scan"}</strong>
        </div>
        {scanState.status === "ready" ? (
          <span className="chain-pill">{formatWalletAddress(scanState.account)}</span>
        ) : (
          <span className="chain-pill">testnet scan</span>
        )}
      </div>
      <p>
        Scan reviewed inventory IDs against the connected wallet. Manual token ID entry remains available for future
        indexer-backed inventory.
      </p>
      <button className="secondary-action" disabled={scanState.status === "scanning"} onClick={() => void handleScan()} type="button">
        {scanState.status === "scanning" ? <Search size={15} aria-hidden="true" /> : <Wallet size={15} aria-hidden="true" />}
        {scanState.status === "scanning" ? "Scanning inventory" : "Scan wallet inventory"}
      </button>

      {scanState.status === "ready" ? (
        <TokenScanResult
          message={tokens.length > 0 ? scanState.scan.message : "No redeemable known inventory tokens found for this wallet."}
          mode={mode}
          onSelectTokenId={onSelectTokenId}
          tokens={tokens}
        />
      ) : null}

      {scanState.status === "failed" ? (
        <p className="transaction-error" role="status">
          {scanState.message}
        </p>
      ) : null}
    </aside>
  );
}

function TokenScanResult({
  message,
  mode,
  onSelectTokenId,
  tokens
}: {
  message: string;
  mode: "select" | "vault";
  onSelectTokenId?: (tokenId: bigint) => void;
  tokens: KnownInventoryToken[];
}) {
  if (tokens.length === 0) {
    return (
      <p className="transaction-hash" role="status">
        {message}
      </p>
    );
  }

  return (
    <div className="known-token-list" role="list" aria-label="Owned known inventory tokens">
      {tokens.map((token) => (
        <article className="known-token-card" key={token.inventoryId} role="listitem">
          <div>
            <strong>{token.title}</strong>
            <span>{token.subtitle}</span>
            <span>Forge Tier {token.forgeTier} / {token.tradeInEligible ? "trade-in eligible" : "protected hold"}</span>
            <code>{token.tokenId.toString()}</code>
          </div>
          {mode === "vault" ? (
            <div className="vault-card-actions">
              <Link className="secondary-action" href="/market">
                <Store size={15} aria-hidden="true" />
                Market
              </Link>
              <Link className="secondary-action" href="/redemption">
                <PackageCheck size={15} aria-hidden="true" />
                Redeem
              </Link>
            </div>
          ) : onSelectTokenId ? (
            <button className="secondary-action" onClick={() => onSelectTokenId(token.tokenId)} type="button">
              Use token {token.tokenId.toString()}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
