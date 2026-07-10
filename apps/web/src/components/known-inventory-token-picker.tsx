"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { Search, Wallet } from "lucide-react";
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
  onSelectTokenId: (tokenId: bigint) => void;
  readClient?: TokenReadClient;
  registryMessage?: string;
  requireRedeemable?: boolean;
};

type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "ready"; account: Address; scan: KnownInventoryTokenScan }
  | { status: "failed"; message: string };

export function KnownInventoryTokenPicker({
  contracts,
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
        setScanState({ status: "failed", message: "Connect a wallet before scanning known seeded inventory." });
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
    <aside className="known-token-picker" aria-label="Known seeded inventory token picker">
      <div className="transaction-state-row">
        <div>
          <span className="eyebrow">Known seeded inventory</span>
          <strong>Wallet token scan</strong>
        </div>
        {scanState.status === "ready" ? (
          <span className="chain-pill">{formatWalletAddress(scanState.account)}</span>
        ) : (
          <span className="chain-pill">testnet scan</span>
        )}
      </div>
      <p>
        Scan known seeded inventory only. Manual token ID entry stays available for non-seeded test tokens and future
        indexer-backed inventory.
      </p>
      <button className="secondary-action" disabled={scanState.status === "scanning"} onClick={() => void handleScan()} type="button">
        {scanState.status === "scanning" ? <Search size={15} aria-hidden="true" /> : <Wallet size={15} aria-hidden="true" />}
        {scanState.status === "scanning" ? "Scanning inventory" : "Scan wallet inventory"}
      </button>

      {scanState.status === "ready" ? (
        <TokenScanResult tokens={tokens} message={tokens.length > 0 ? scanState.scan.message : "No redeemable seeded inventory tokens found for this wallet."} onSelectTokenId={onSelectTokenId} />
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
  onSelectTokenId,
  tokens
}: {
  message: string;
  onSelectTokenId: (tokenId: bigint) => void;
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
    <div className="known-token-list" role="list" aria-label="Owned seeded inventory tokens">
      {tokens.map((token) => (
        <article className="known-token-card" key={token.inventoryId} role="listitem">
          <div>
            <strong>{token.title}</strong>
            <span>{token.subtitle}</span>
            <span>Forge Tier {token.forgeTier} / {token.tradeInEligible ? "trade-in eligible" : "protected hold"}</span>
            <code>{token.tokenId.toString()}</code>
          </div>
          <button className="secondary-action" onClick={() => onSelectTokenId(token.tokenId)} type="button">
            Use token {token.tokenId.toString()}
          </button>
        </article>
      ))}
    </div>
  );
}
