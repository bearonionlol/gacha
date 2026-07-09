"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address, Hash, TransactionReceipt } from "viem";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Send, Wallet } from "lucide-react";
import { createRobinhoodPublicClient } from "../lib/contracts/public-client";
import type { ProtocolContracts } from "../lib/contracts/registry";
import {
  buildExplorerTxUrl,
  createWriteRequest,
  formatTransactionHash,
  getTransactionErrorMessage,
  sendPreparedWrite,
  waitForTransactionReceipt,
  type PreparedWrite,
  type ReceiptClient,
  type WriteRequest
} from "../lib/contracts/transactions";
import {
  type Eip1193Provider,
  formatWalletAddress,
  getInjectedEthereumProvider,
  getWalletErrorMessage,
  readWalletChainId,
  requestWalletAccounts,
  robinhoodTestnetChainId,
  switchToRobinhoodTestnet
} from "../lib/contracts/wallet";

type TransactionSummaryRow = {
  label: string;
  value: string;
};

type TransactionPanelAction = {
  ctaLabel: string;
  description: string;
  writeRequest: (contracts: ProtocolContracts) => WriteRequest | PreparedWrite | null;
};

type TransactionActionPanelProps = TransactionPanelAction & {
  actionDisabledReason?: string | null;
  contracts: ProtocolContracts | null;
  registryMessage?: string;
  summary?: TransactionSummaryRow[];
  approval?: TransactionPanelAction;
  receiptClient?: ReceiptClient;
  sendWrite?: (provider: Eip1193Provider, account: Address, request: PreparedWrite) => Promise<Hash>;
  title: string;
};

type TransactionState =
  | { status: "idle" }
  | { status: "submitting"; label: string }
  | { status: "submitted"; hash: Hash; label: string }
  | { status: "confirmed"; hash: Hash; label: string; receipt: TransactionReceipt }
  | { status: "failed"; label: string; message: string };

export function TransactionActionPanel({
  actionDisabledReason = null,
  approval,
  contracts,
  ctaLabel,
  description,
  receiptClient,
  registryMessage = "Live contracts are not configured for this environment.",
  sendWrite = sendPreparedWrite,
  summary = [],
  title,
  writeRequest
}: TransactionActionPanelProps) {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [transactionState, setTransactionState] = useState<TransactionState>({ status: "idle" });

  useEffect(() => {
    setProvider(getInjectedEthereumProvider(window));
    setIsReady(true);
  }, []);

  const compactAddress = useMemo(() => (account === null ? null : formatWalletAddress(account)), [account]);
  const isTargetChain = chainId === robinhoodTestnetChainId;
  const canSubmit = contracts !== null && provider !== null && account !== null && isTargetChain;
  const isBusy = transactionState.status === "submitting" || transactionState.status === "submitted";

  async function handleConnect() {
    if (provider === null) {
      return;
    }

    setIsConnecting(true);
    setWalletError(null);

    try {
      const accounts = await requestWalletAccounts(provider);
      setAccount((accounts[0] as Address | undefined) ?? null);
      setChainId(await readWalletChainId(provider));
    } catch (error) {
      setWalletError(getWalletErrorMessage(error));
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSwitchChain() {
    if (provider === null) {
      return;
    }

    setIsSwitching(true);
    setWalletError(null);

    try {
      await switchToRobinhoodTestnet(provider);
      setChainId(await readWalletChainId(provider));
    } catch (error) {
      setWalletError(getWalletErrorMessage(error));
    } finally {
      setIsSwitching(false);
    }
  }

  async function handleSubmit(action: TransactionPanelAction) {
    if (!canSubmit || contracts === null || provider === null || account === null) {
      return;
    }

    if (action.ctaLabel === ctaLabel && actionDisabledReason !== null) {
      setTransactionState({
        status: "failed",
        label: action.ctaLabel,
        message: actionDisabledReason
      });
      return;
    }

    setTransactionState({ status: "submitting", label: action.ctaLabel });

    try {
      const request = action.writeRequest(contracts);

      if (request === null) {
        setTransactionState({
          status: "failed",
          label: action.ctaLabel,
          message: "Enter required testnet action details before submitting."
        });
        return;
      }

      const preparedWrite = prepareWrite(request);
      const hash = await sendWrite(provider, account, preparedWrite);
      setTransactionState({ status: "submitted", hash, label: action.ctaLabel });

      const receipt = await waitForTransactionReceipt(receiptClient ?? createRobinhoodPublicClient(), hash);
      if (receipt.status !== "success") {
        setTransactionState({
          status: "failed",
          label: action.ctaLabel,
          message: "Transaction failed or could not be confirmed. Review wallet details and retry."
        });
        return;
      }

      setTransactionState({ status: "confirmed", hash, label: action.ctaLabel, receipt });
    } catch (error) {
      setTransactionState({
        status: "failed",
        label: action.ctaLabel,
        message: getTransactionErrorMessage(error)
      });
    }
  }

  const renderStatus = () => {
    if (!isReady) {
      return <span>Checking wallet</span>;
    }

    if (contracts === null) {
      return <span>{registryMessage}</span>;
    }

    if (provider === null) {
      return <span>Open an EVM wallet such as Phantom or MetaMask to send testnet transactions.</span>;
    }

    if (account === null) {
      return (
        <button className="secondary-action" disabled={isConnecting} onClick={handleConnect} type="button">
          <Wallet size={15} aria-hidden="true" />
          {isConnecting ? "Connecting" : "Connect wallet"}
        </button>
      );
    }

    if (!isTargetChain) {
      return (
        <button className="secondary-action" disabled={isSwitching} onClick={handleSwitchChain} type="button">
          <Wallet size={15} aria-hidden="true" />
          {isSwitching ? "Switching" : "Switch to testnet"}
        </button>
      );
    }

    const primaryDisabled = isBusy || actionDisabledReason !== null;

    return (
      <div className="transaction-actions">
        {approval ? (
          <button disabled={isBusy} onClick={() => void handleSubmit(approval)} type="button">
            {isBusy && transactionState.label === approval.ctaLabel ? (
              <Loader2 size={15} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={15} aria-hidden="true" />
            )}
            {buttonLabel(approval.ctaLabel, transactionState)}
          </button>
        ) : null}
        <button
          className="primary-action"
          disabled={primaryDisabled}
          onClick={() => void handleSubmit(primaryAction)}
          type="button"
        >
          {isBusy && transactionState.label === ctaLabel ? (
            <Loader2 size={15} aria-hidden="true" />
          ) : (
            <Send size={15} aria-hidden="true" />
          )}
          {buttonLabel(ctaLabel, transactionState)}
        </button>
        {actionDisabledReason !== null ? <small>{actionDisabledReason}</small> : null}
      </div>
    );
  };

  const primaryAction = useMemo(
    () => ({
      ctaLabel,
      description,
      writeRequest
    }),
    [ctaLabel, description, writeRequest]
  );

  return (
    <aside className="transaction-panel" aria-label={`${title} transaction panel`}>
      <div className="transaction-state-row">
        <div>
          <span className="eyebrow">Phase 4B testnet write</span>
          <strong>{title}</strong>
        </div>
        {account !== null && isTargetChain ? (
          <span className="chain-pill">{compactAddress}</span>
        ) : (
          <span className="chain-pill">testnet only</span>
        )}
      </div>

      <p>{description}</p>
      {approval ? <p>{approval.description}</p> : null}
      <ul className="transaction-call-list" aria-label={`${title} transaction calls`}>
        {approval ? <li>{approval.ctaLabel}</li> : null}
        <li>{ctaLabel}</li>
      </ul>

      {summary.length > 0 ? (
        <dl className="transaction-summary">
          {summary.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {walletError !== null ? (
        <p className="transaction-error" role="status">
          <AlertCircle size={15} aria-hidden="true" />
          {walletError}
        </p>
      ) : null}

      {renderStatus()}
      <TransactionReceiptState state={transactionState} />
    </aside>
  );
}

function prepareWrite(request: WriteRequest | PreparedWrite): PreparedWrite {
  return "kind" in request ? createWriteRequest(request) : request;
}

function buttonLabel(label: string, state: TransactionState): string {
  if (state.status === "submitting" && state.label === label) {
    return "Confirm in wallet";
  }

  if (state.status === "submitted" && state.label === label) {
    return "Waiting for receipt";
  }

  if (state.status === "failed" && state.label === label) {
    return `Retry ${label}`;
  }

  return label;
}

function TransactionReceiptState({ state }: { state: TransactionState }) {
  if (state.status === "idle" || state.status === "submitting") {
    return null;
  }

  if (state.status === "failed") {
    return (
      <p className="transaction-error" role="status">
        <AlertCircle size={15} aria-hidden="true" />
        {state.message}
      </p>
    );
  }

  const blockNumber = state.status === "confirmed" ? state.receipt.blockNumber?.toString() : null;

  return (
    <div className={state.status === "confirmed" ? "transaction-success" : "transaction-hash"} role="status">
      <CheckCircle2 size={15} aria-hidden="true" />
      <span>
        {state.status === "confirmed" && blockNumber !== null
          ? `Confirmed in block ${blockNumber}`
          : "Transaction submitted"}
      </span>
      <strong>{formatTransactionHash(state.hash)}</strong>
      <a href={buildExplorerTxUrl(state.hash)} rel="noreferrer" target="_blank">
        View on explorer
        <ExternalLink size={13} aria-hidden="true" />
      </a>
    </div>
  );
}
