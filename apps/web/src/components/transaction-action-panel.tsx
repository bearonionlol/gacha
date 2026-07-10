"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hash, TransactionReceipt } from "viem";
import { AlertCircle, CheckCircle2, ExternalLink, Info, Loader2, RefreshCw, Send, Wallet } from "lucide-react";
import { loadChainContextFromEnv, type ChainContext } from "../lib/deployments";
import type { ProtocolContracts } from "../lib/contracts/registry";
import {
  buildExplorerTxUrl,
  createConfiguredPublicClient,
  createWriteRequest,
  formatTransactionHash,
  getTransactionErrorMessage,
  sendPreparedWrite,
  switchWalletToChain,
  waitForTransactionReceipt,
  type PreparedWrite,
  type ReceiptClient,
  type TransactionReplacement,
  type WriteRequest
} from "../lib/contracts/transactions";
import {
  type Eip1193Provider,
  formatWalletAddress,
  getInjectedEthereumProvider,
  getWalletErrorMessage,
  readWalletAccounts,
  readWalletChainId,
  requestWalletAccounts
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
  approval?: TransactionPanelAction;
  chainContext?: ChainContext;
  contracts: ProtocolContracts | null;
  onAccountChange?: (account: Address) => void;
  onConfirmed?: (receipt: TransactionReceipt) => void;
  receiptClient?: ReceiptClient;
  registryMessage?: string;
  sendWrite?: (provider: Eip1193Provider, account: Address, request: PreparedWrite) => Promise<Hash>;
  summary?: TransactionSummaryRow[];
  title: string;
};

type TransactionState =
  | { status: "idle" }
  | { status: "submitting"; label: string }
  | { status: "submitted"; hash: Hash; label: string; recovered: boolean }
  | { status: "replaced"; hash: Hash; label: string; previousHash: Hash; reason: TransactionReplacement["reason"] }
  | { status: "confirmed"; hash: Hash; label: string; receipt: TransactionReceipt }
  | { status: "failed"; hash?: Hash; label: string; message: string; recoverable?: boolean };

type StoredTransaction = {
  hash: Hash;
  label: string;
  submittedAt: number;
};

const pendingTransactionPrefix = "gacha:pending-transaction";
const hashPattern = /^0x[a-fA-F0-9]{64}$/;

export function TransactionActionPanel({
  actionDisabledReason = null,
  approval,
  chainContext: suppliedChainContext,
  contracts,
  ctaLabel,
  description,
  onAccountChange,
  onConfirmed,
  receiptClient,
  registryMessage = "Live contracts are not configured for this environment.",
  sendWrite,
  summary = [],
  title,
  writeRequest
}: TransactionActionPanelProps) {
  const chainContext = useMemo(
    () => suppliedChainContext ?? loadChainContextFromEnv({
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY
    }),
    [suppliedChainContext]
  );
  const resolvedReceiptClient = useMemo(
    () => receiptClient ?? (createConfiguredPublicClient(chainContext) as unknown as ReceiptClient),
    [chainContext, receiptClient]
  );
  const storageKey = useMemo(
    () => `${pendingTransactionPrefix}:${chainContext.chainId}:${slugify(title)}`,
    [chainContext.chainId, title]
  );
  const mountedRef = useRef(true);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [transactionState, setTransactionState] = useState<TransactionState>({ status: "idle" });

  useEffect(() => {
    mountedRef.current = true;
    const nextProvider = getInjectedEthereumProvider(window);
    setProvider(nextProvider);
    setIsReady(true);

    if (nextProvider === null) {
      return () => {
        mountedRef.current = false;
      };
    }

    const applyAccounts = (accounts: unknown) => {
      const nextAccount = Array.isArray(accounts)
        ? (accounts.find((value): value is Address => typeof value === "string") ?? null)
        : null;
      setAccount(nextAccount);
      if (nextAccount !== null) onAccountChange?.(nextAccount);
    };
    const applyChainId = (nextChainId: unknown) => {
      if (typeof nextChainId !== "string") {
        setChainId(null);
        return;
      }
      const parsed = Number.parseInt(nextChainId, 16);
      setChainId(Number.isNaN(parsed) ? null : parsed);
    };

    void Promise.all([readWalletAccounts(nextProvider), readWalletChainId(nextProvider)]).then(
      ([accounts, connectedChainId]) => {
        if (!mountedRef.current) return;
        applyAccounts(accounts);
        setChainId(connectedChainId);
      },
      () => undefined
    );
    nextProvider.on?.("accountsChanged", applyAccounts);
    nextProvider.on?.("chainChanged", applyChainId);

    return () => {
      mountedRef.current = false;
      nextProvider.removeListener?.("accountsChanged", applyAccounts);
      nextProvider.removeListener?.("chainChanged", applyChainId);
    };
  }, [onAccountChange]);

  const persistPending = useCallback((hash: Hash, label: string) => {
    const stored: StoredTransaction = { hash, label, submittedAt: Date.now() };
    window.localStorage.setItem(storageKey, JSON.stringify(stored));
  }, [storageKey]);

  const clearPending = useCallback(() => {
    window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  const monitorTransaction = useCallback(async (initialHash: Hash, label: string, recovered = false) => {
    let activeHash = initialHash;
    let replacementReason: TransactionReplacement["reason"] | null = null;
    if (mountedRef.current) setTransactionState({ status: "submitted", hash: initialHash, label, recovered });

    try {
      const receipt = await waitForTransactionReceipt(resolvedReceiptClient, initialHash, (replacement) => {
        const nextHash = replacement.transaction.hash;
        replacementReason = replacement.reason;
        activeHash = nextHash;
        persistPending(nextHash, label);
        if (mountedRef.current) {
          setTransactionState({
            status: "replaced",
            hash: nextHash,
            label,
            previousHash: initialHash,
            reason: replacement.reason
          });
        }
      });

      if (replacementReason === "cancelled") {
        clearPending();
        if (mountedRef.current) {
          setTransactionState({
            status: "failed",
            hash: activeHash,
            label,
            message: "The pending transaction was cancelled in your wallet. No protocol action was completed."
          });
        }
        return;
      }

      if (receipt.status !== "success") {
        clearPending();
        if (mountedRef.current) {
          setTransactionState({
            status: "failed",
            hash: activeHash,
            label,
            message: "The transaction reverted on-chain. No successful protocol action was recorded."
          });
        }
        return;
      }

      const confirmedHash = receipt.transactionHash ?? activeHash;
      clearPending();
      if (mountedRef.current) {
        setTransactionState({ status: "confirmed", hash: confirmedHash, label, receipt });
        onConfirmed?.(receipt);
      }
    } catch (error) {
      if (mountedRef.current) {
        setTransactionState({
          status: "failed",
          hash: activeHash,
          label,
          message: getTransactionErrorMessage(error, chainContext),
          recoverable: true
        });
      }
    }
  }, [chainContext, clearPending, onConfirmed, persistPending, resolvedReceiptClient]);

  useEffect(() => {
    const stored = readStoredTransaction(window.localStorage.getItem(storageKey));
    if (stored !== null) void monitorTransaction(stored.hash, stored.label, true);
  }, [monitorTransaction, storageKey]);

  const compactAddress = useMemo(() => (account === null ? null : formatWalletAddress(account)), [account]);
  const isTargetChain = chainId === chainContext.chainId;
  const canSubmit = chainContext.writesEnabled && contracts !== null && provider !== null && account !== null && isTargetChain;
  const isBusy = ["submitting", "submitted", "replaced"].includes(transactionState.status);
  const currentActionLabel = "label" in transactionState ? transactionState.label : null;
  const hasUnresolvedHash = transactionState.status === "failed" &&
    transactionState.recoverable === true &&
    transactionState.hash !== undefined;

  async function handleConnect() {
    if (provider === null) return;
    setIsConnecting(true);
    setWalletError(null);

    try {
      const accounts = await requestWalletAccounts(provider);
      const connectedAccount = (accounts[0] as Address | undefined) ?? null;
      setAccount(connectedAccount);
      if (connectedAccount !== null) onAccountChange?.(connectedAccount);
      setChainId(await readWalletChainId(provider));
    } catch (error) {
      setWalletError(getWalletErrorMessage(error));
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSwitchChain() {
    if (provider === null) return;
    setIsSwitching(true);
    setWalletError(null);

    try {
      await switchWalletToChain(provider, chainContext);
      setChainId(await readWalletChainId(provider));
    } catch (error) {
      setWalletError(getWalletErrorMessage(error));
    } finally {
      setIsSwitching(false);
    }
  }

  async function handleSubmit(action: TransactionPanelAction) {
    if (!canSubmit || contracts === null || provider === null || account === null) return;
    if (action.ctaLabel === ctaLabel && actionDisabledReason !== null) return;
    setTransactionState({ status: "submitting", label: action.ctaLabel });

    try {
      const request = action.writeRequest(contracts);
      if (request === null) {
        setTransactionState({
          status: "failed",
          label: action.ctaLabel,
          message: "Complete the required action details before submitting."
        });
        return;
      }

      const preparedWrite = prepareWrite(request);
      const hash = sendWrite
        ? await sendWrite(provider, account, preparedWrite)
        : await sendPreparedWrite(provider, account, preparedWrite, chainContext);
      persistPending(hash, action.ctaLabel);
      await monitorTransaction(hash, action.ctaLabel);
    } catch (error) {
      setTransactionState({
        status: "failed",
        label: action.ctaLabel,
        message: getTransactionErrorMessage(error, chainContext)
      });
    }
  }

  const primaryAction = useMemo(
    () => ({ ctaLabel, description, writeRequest }),
    [ctaLabel, description, writeRequest]
  );

  const renderActions = () => {
    if (!isReady) return <span className="transaction-availability">Checking wallet availability</span>;
    if (chainContext.isDemo) {
      return (
        <p className="transaction-availability">
          <Info size={15} aria-hidden="true" />
          Demo preview only. Configure a reviewed deployment registry to enable wallet actions.
        </p>
      );
    }
    if (!chainContext.writesEnabled) {
      return (
        <p className="transaction-availability transaction-lockout" role="status">
          <AlertCircle size={15} aria-hidden="true" />
          {chainContext.writeBlockReason}
        </p>
      );
    }
    if (contracts === null) return <span className="transaction-availability">{registryMessage}</span>;
    if (provider === null) {
      return <span className="transaction-availability">Install or open an EVM wallet to continue on {chainContext.chainName}.</span>;
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
          <RefreshCw size={15} aria-hidden="true" />
          {isSwitching ? "Switching network" : chainContext.switchLabel}
        </button>
      );
    }

    const primaryDisabled = isBusy || hasUnresolvedHash || actionDisabledReason !== null;
    return (
      <div className="transaction-actions">
        {approval ? (
          <button disabled={isBusy || hasUnresolvedHash} onClick={() => void handleSubmit(approval)} type="button">
            {isBusy && currentActionLabel === approval.ctaLabel ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
            {buttonLabel(approval.ctaLabel, transactionState)}
          </button>
        ) : null}
        <button className="primary-action" disabled={primaryDisabled} onClick={() => void handleSubmit(primaryAction)} type="button">
          {isBusy && currentActionLabel === ctaLabel ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
          {buttonLabel(ctaLabel, transactionState)}
        </button>
        {actionDisabledReason !== null ? <small>{actionDisabledReason}</small> : null}
      </div>
    );
  };

  return (
    <aside className="transaction-panel" aria-label={`${title} transaction panel`}>
      <div className="transaction-state-row">
        <div>
          <span className="eyebrow">{chainContext.transactionLabel}</span>
          <strong>{title}</strong>
        </div>
        <span className={`chain-pill mode-${chainContext.mode}`}>
          {account !== null && isTargetChain ? compactAddress : chainContext.environmentLabel}
        </span>
      </div>

      <p>{description}</p>
      {approval ? <p>{approval.description}</p> : null}
      {chainContext.isMainnet ? <p className="mainnet-caution"><AlertCircle size={15} aria-hidden="true" /> Uses real ETH on mainnet.</p> : null}

      <ul className="transaction-call-list" aria-label={`${title} transaction calls`}>
        {approval ? <li>{approval.ctaLabel}</li> : null}
        <li>{ctaLabel}</li>
      </ul>

      {summary.length > 0 ? (
        <dl className="transaction-summary">
          {summary.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className="breakable-value" title={row.value}>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {walletError !== null ? <p className="transaction-error" role="status"><AlertCircle size={15} aria-hidden="true" />{walletError}</p> : null}
      {renderActions()}
      <TransactionReceiptState
        chainContext={chainContext}
        onCheckStatus={(hash, label) => void monitorTransaction(hash, label, true)}
        state={transactionState}
      />
    </aside>
  );
}

function prepareWrite(request: WriteRequest | PreparedWrite): PreparedWrite {
  return "kind" in request ? createWriteRequest(request) : request;
}

function buttonLabel(label: string, state: TransactionState): string {
  if (state.status === "submitting" && state.label === label) return "Confirm in wallet";
  if ((state.status === "submitted" || state.status === "replaced") && state.label === label) return "Confirming";
  if (state.status === "failed" && state.label === label && state.recoverable && state.hash) return "Status unresolved";
  if (state.status === "failed" && state.label === label && state.hash === undefined) return `Retry ${label}`;
  return label;
}

function TransactionReceiptState({
  chainContext,
  onCheckStatus,
  state
}: {
  chainContext: ChainContext;
  onCheckStatus: (hash: Hash, label: string) => void;
  state: TransactionState;
}) {
  if (state.status === "idle" || state.status === "submitting") return null;

  if (state.status === "failed") {
    return (
      <div className="transaction-error transaction-receipt-state" role="status" aria-live="polite">
        <AlertCircle size={15} aria-hidden="true" />
        <span>{state.message}</span>
        {state.hash ? <TransactionExplorerLink chainContext={chainContext} hash={state.hash} /> : null}
        {state.hash && state.recoverable ? (
          <button className="text-action" onClick={() => onCheckStatus(state.hash!, state.label)} type="button">
            <RefreshCw size={13} aria-hidden="true" /> Check status
          </button>
        ) : null}
      </div>
    );
  }

  if (state.status === "confirmed") {
    const blockNumber = state.receipt.blockNumber?.toString();
    return (
      <div className="transaction-success transaction-receipt-state" role="status" aria-live="polite">
        <CheckCircle2 size={15} aria-hidden="true" />
        <span>{blockNumber ? `Confirmed in block ${blockNumber}` : "Transaction confirmed"}</span>
        <strong>{formatTransactionHash(state.hash)}</strong>
        <TransactionExplorerLink chainContext={chainContext} hash={state.hash} />
      </div>
    );
  }

  const replacementCopy = state.status === "replaced"
    ? state.reason === "repriced"
      ? "Wallet repriced the transaction. Tracking the new hash."
      : "Wallet replaced the transaction. Tracking the new hash."
    : state.recovered
      ? "Recovered after refresh. Waiting for network confirmation."
      : "Submitted. Waiting for network confirmation.";

  return (
    <div className="transaction-hash transaction-receipt-state" role="status" aria-live="polite">
      <Loader2 className="spin" size={15} aria-hidden="true" />
      <span>{replacementCopy}</span>
      <strong>{formatTransactionHash(state.hash)}</strong>
      <TransactionExplorerLink chainContext={chainContext} hash={state.hash} />
    </div>
  );
}

function TransactionExplorerLink({ chainContext, hash }: { chainContext: ChainContext; hash: Hash }) {
  return (
    <a href={buildExplorerTxUrl(hash, chainContext)} rel="noreferrer" target="_blank">
      View on {chainContext.explorerName}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function readStoredTransaction(value: string | null): StoredTransaction | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredTransaction>;
    return typeof parsed.hash === "string" && hashPattern.test(parsed.hash) && typeof parsed.label === "string"
      ? { hash: parsed.hash as Hash, label: parsed.label, submittedAt: Number(parsed.submittedAt ?? 0) }
      : null;
  } catch {
    return null;
  }
}
