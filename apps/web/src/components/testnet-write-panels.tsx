"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, type Address, type Hex, type TransactionReceipt } from "viem";
import {
  getDeploymentDiagnostics,
  loadDeploymentRegistrySnapshotFromEnv,
  resolveChainContext,
  type ChainContext
} from "../lib/deployments";
import { getReadyContractRegistry, type ProtocolContracts } from "../lib/contracts/registry";
import {
  createPackRevealRequestForPurchase,
  createPackPurchaseRequest,
  createMarketListRequestForToken,
  createRedemptionAdminRequest,
  createRedemptionRequestForToken,
  extractPackPurchaseId,
  getPaidActionSafetyBlockReason,
  parseAllowlistProof,
  parsePositiveActionId,
  parsePositiveEthAmount,
  parsePositiveTokenId,
  protocolWriteConfig,
  type RedemptionAdminMode,
} from "../lib/contracts/transaction-config";
import { readLiveDropSummary, type LiveDropSummary } from "../lib/contracts/live-state";
import { createConfiguredPublicClient } from "../lib/contracts/transactions";
import { readMarketplaceListing, type LiveMarketplaceListing } from "../lib/contracts/marketplace-live";
import { readBuybackQuote, type LiveBuybackQuote } from "../lib/contracts/buyback-live";
import { KnownInventoryTokenPicker } from "./known-inventory-token-picker";
import { TransactionActionPanel } from "./transaction-action-panel";

type RegistryPanelState = {
  chainContext: ChainContext;
  contracts: ProtocolContracts | null;
  fullStackReady: boolean;
  message: string;
};

function useClientRegistry(): RegistryPanelState {
  return useMemo(() => {
    const snapshot = loadDeploymentRegistrySnapshotFromEnv({
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY
    });
    const registry = getReadyContractRegistry(snapshot);
    const diagnostics = getDeploymentDiagnostics(snapshot);
    const chainContext = resolveChainContext(snapshot);

    if (registry.contracts === null) {
      return { chainContext, contracts: null, fullStackReady: false, message: registry.status.message };
    }

    return {
      chainContext,
      contracts: registry.contracts,
      fullStackReady: diagnostics.totalReadyCount === diagnostics.contracts.length,
      message: registry.status.message
    };
  }, []);
}

type DropReadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; summary: LiveDropSummary }
  | { status: "error" };

export function PackPurchasePanel({
  onDropSummaryChange,
  onPurchaseConfirmed
}: {
  onDropSummaryChange?: (summary: LiveDropSummary | null) => void;
  onPurchaseConfirmed?: (purchaseId: bigint) => void;
}) {
  const registry = useClientRegistry();
  const client = useMemo(() => createConfiguredPublicClient(registry.chainContext), [registry.chainContext]);
  const [walletAccount, setWalletAccount] = useState<Address | null>(null);
  const [dropState, setDropState] = useState<DropReadState>({ status: "idle" });
  const [allowlistProofInput, setAllowlistProofInput] = useState("");
  const [refresh, setRefresh] = useState(0);
  const fullStackBlocked = registry.contracts !== null && !registry.fullStackReady;
  const blockedMessage =
    "New pulls are paused until PackSale and Vault Forge V4 are deployed together. Existing purchases can still be revealed.";
  const liveSummary = dropState.status === "ready" ? dropState.summary : null;
  const isAllowlisted = liveSummary !== null && !/^0x0{64}$/i.test(liveSummary.allowlistRoot);
  const allowlistProof = parseAllowlistProof(allowlistProofInput);
  const purchaseValue = liveSummary?.price ?? protocolWriteConfig.pack.value;
  const purchaseValueLabel = `${formatEther(purchaseValue)} ETH`;
  const dropDisabledReason = getDropDisabledReason(
    dropState,
    registry.chainContext,
    fullStackBlocked,
    isAllowlisted,
    allowlistProof
  );
  const handleAccountChange = useCallback((account: Address) => setWalletAccount(account), []);

  useEffect(() => {
    let cancelled = false;
    if (registry.contracts === null) {
      setDropState({ status: "idle" });
      onDropSummaryChange?.(null);
      return () => { cancelled = true; };
    }

    setDropState({ status: "loading" });
    void readLiveDropSummary({
      account: walletAccount,
      address: registry.contracts.PackSale,
      client,
      dropId: protocolWriteConfig.pack.dropId
    }).then(
      (summary) => {
        if (cancelled) return;
        setDropState({ status: "ready", summary });
        onDropSummaryChange?.(summary);
      },
      () => {
        if (cancelled) return;
        setDropState({ status: "error" });
        onDropSummaryChange?.(null);
      }
    );

    return () => { cancelled = true; };
  }, [client, onDropSummaryChange, refresh, registry.contracts, walletAccount]);

  return (
    <div className="transaction-panel-stack pack-purchase-stack">
      {isAllowlisted ? (
        <label className="transaction-input-row allowlist-proof-input" htmlFor="pack-allowlist-proof">
          <span>Allowlist proof</span>
          <textarea
            aria-describedby="pack-allowlist-proof-help"
            id="pack-allowlist-proof"
            onChange={(event) => setAllowlistProofInput(event.target.value)}
            placeholder="One bytes32 value per line, or [] for an explicitly empty proof"
            value={allowlistProofInput}
          />
          <small id="pack-allowlist-proof-help">This drop is restricted. The public purchase function will not be used.</small>
        </label>
      ) : null}
      <TransactionActionPanel
      actionDisabledReason={dropDisabledReason}
      chainContext={registry.chainContext}
      contracts={fullStackBlocked ? null : registry.contracts}
      ctaLabel="Reserve capsule"
      description={isAllowlisted
        ? "Reserves one allowlisted capsule with the supplied Merkle proof and exact live price. The proof is verified by PackSale."
        : "Reserves one capsule using the exact live drop price. Pull contents, wallet cap, and remaining inventory are shown before confirmation."}
      onAccountChange={handleAccountChange}
      onConfirmed={(receipt) => {
        const purchaseId = extractPackPurchaseId(receipt);
        if (purchaseId !== null) onPurchaseConfirmed?.(purchaseId);
        setRefresh((revision) => revision + 1);
      }}
      registryMessage={fullStackBlocked ? blockedMessage : registry.message}
      summary={[
        { label: "Function", value: isAllowlisted ? "PackSale.purchaseAllowlisted" : "PackSale.purchase" },
        { label: "Drop ID", value: protocolWriteConfig.pack.dropId.toString() },
        { label: "Exact price", value: dropState.status === "loading" ? "loading" : purchaseValueLabel },
        { label: "Remaining", value: liveSummary?.remainingInventory.toString() ?? "preview" },
        { label: "Wallet cap", value: liveSummary === null ? "preview" : `${liveSummary.purchasesByWallet?.toString() ?? "connect"} / ${liveSummary.maxPerWallet}` }
      ]}
      title="Reserve capsule"
      writeRequest={(contracts) => createPackPurchaseRequest({
        allowlistProof,
        allowlistRoot: liveSummary?.allowlistRoot ?? `0x${"0".repeat(64)}`,
        contracts,
        dropId: protocolWriteConfig.pack.dropId,
        value: purchaseValue
      })}
      />
    </div>
  );
}

function getDropDisabledReason(
  state: DropReadState,
  chainContext: ChainContext,
  fullStackBlocked: boolean,
  isAllowlisted: boolean,
  allowlistProof: readonly Hex[] | null
): string | null {
  if (fullStackBlocked) return "New pulls are paused until the complete protocol registry is available.";
  const safetyBlock = getPaidActionSafetyBlockReason(chainContext);
  if (safetyBlock !== null) return safetyBlock;
  if (chainContext.isDemo) return null;
  if (chainContext.isMainnet && !protocolWriteConfig.pack.dropIdIsExplicit) {
    return "Mainnet drop ID is not explicitly configured. Purchases remain locked.";
  }
  if (state.status === "idle" || state.status === "loading") return "Loading the live drop price, supply, and wallet cap.";
  if (state.status === "error") return "Live drop data could not be verified. Refresh before purchasing.";
  if (isAllowlisted && allowlistProof === null) {
    return "This drop requires an explicit valid bytes32 Merkle proof. Enter the proof before purchasing.";
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < state.summary.startTime) return "This drop has not opened yet.";
  if (now > state.summary.endTime) return "This drop has ended.";
  if (state.summary.remainingInventory === 0n || state.summary.sold >= state.summary.maxSupply) return "This drop is sold out.";
  if (state.summary.purchasesByWallet !== null && state.summary.purchasesByWallet >= state.summary.maxPerWallet) {
    return "This wallet has reached the published purchase cap.";
  }
  return null;
}

export function PackRevealPanel({ initialPurchaseId = null }: { initialPurchaseId?: bigint | null }) {
  const registry = useClientRegistry();
  const [purchaseIdInput, setPurchaseIdInput] = useState(initialPurchaseId?.toString() ?? "");
  const purchaseId = parsePositiveActionId(purchaseIdInput);

  useEffect(() => {
    if (initialPurchaseId !== null) setPurchaseIdInput(initialPurchaseId.toString());
  }, [initialPurchaseId]);

  return (
    <div className="transaction-panel-stack">
      <label className="transaction-input-row" htmlFor="pack-reveal-purchase-id">
        <span>Purchase ID</span>
        <input
          id="pack-reveal-purchase-id"
          inputMode="numeric"
          onChange={(event) => setPurchaseIdInput(event.target.value)}
          placeholder="Paste purchase ID"
          type="text"
          value={purchaseIdInput}
        />
      </label>
      <TransactionActionPanel
        actionDisabledReason={purchaseId === null ? "Enter a purchase ID before revealing a pack." : null}
        contracts={registry.contracts}
        chainContext={registry.chainContext}
        ctaLabel="Reveal purchase"
        description="Reveals the reserved capsule after its randomness request is ready. A failed early attempt does not change the reserved pull."
        registryMessage={registry.message}
        summary={[
          { label: "Function", value: "PackSale.reveal" },
          { label: "Purchase ID", value: purchaseId?.toString() ?? "required" }
        ]}
        title="Reveal reserved capsule"
        writeRequest={(contracts) => createPackRevealRequestForPurchase(contracts, purchaseId)}
      />
    </div>
  );
}

type TokenInputPanelProps = {
  inputId: string;
};

function MainnetTokenEntryNotice({ purpose }: { purpose: string }) {
  return (
    <aside className="known-token-picker" aria-label={`${purpose} token source`}>
      <div className="transaction-state-row">
        <div>
          <span className="eyebrow">Connected Vault</span>
          <strong>Enter the owned token ID</strong>
        </div>
        <span className="chain-pill">Mainnet</span>
      </div>
      <p>Use the token ID from the connected wallet's indexed Vault record. The seeded test-inventory scanner is not used on mainnet.</p>
    </aside>
  );
}

export function MarketplaceListPanel({ inputId }: TokenInputPanelProps) {
  const registry = useClientRegistry();
  const [tokenIdInput, setTokenIdInput] = useState("");
  const [askInput, setAskInput] = useState(formatEther(protocolWriteConfig.market.price));
  const tokenId = parsePositiveTokenId(tokenIdInput);
  const askPrice = parsePositiveEthAmount(askInput);
  const listDisabledReason = tokenId === null
    ? "Enter an owned inventory token ID before listing."
    : askPrice === null
      ? "Enter an ask greater than zero with no more than 18 decimal places."
      : null;

  return (
    <div className="transaction-panel-stack">
      {registry.chainContext.isMainnet ? <MainnetTokenEntryNotice purpose="Marketplace" /> : (
        <KnownInventoryTokenPicker
          contracts={registry.contracts}
          onSelectTokenId={(selectedTokenId) => setTokenIdInput(selectedTokenId.toString())}
          registryMessage={registry.message}
        />
      )}
      <label className="transaction-input-row" htmlFor={inputId}>
        <span>Owned inventory token ID</span>
        <input
          id={inputId}
          inputMode="numeric"
          onChange={(event) => setTokenIdInput(event.target.value)}
          placeholder="Paste token ID"
          type="text"
          value={tokenIdInput}
        />
      </label>
      <label className="transaction-input-row" htmlFor={`${inputId}-ask`}>
        <span>Ask price in ETH</span>
        <input
          id={`${inputId}-ask`}
          inputMode="decimal"
          onChange={(event) => setAskInput(event.target.value)}
          placeholder="0.015"
          type="text"
          value={askInput}
        />
      </label>
      <TransactionActionPanel
        actionDisabledReason={listDisabledReason}
        approval={{
          ctaLabel: "Approve Marketplace",
          description: "Approves Marketplace as an ERC-1155 operator before escrow listing.",
          writeRequest: (contracts) => ({
            kind: "approval",
            contracts,
            operator: "Marketplace",
            approved: true
          })
        }}
        chainContext={registry.chainContext}
        contracts={registry.contracts}
        ctaLabel="List item"
        description="Calls Marketplace.list for one owned inventory-backed token."
        registryMessage={registry.message}
        summary={[
          { label: "Function", value: "Marketplace.list" },
          { label: "Amount", value: protocolWriteConfig.market.amount.toString() },
          { label: "Ask", value: askPrice === null ? "required" : `${formatEther(askPrice)} ETH` }
        ]}
        title="Create escrow listing"
        writeRequest={(contracts) => createMarketListRequestForToken(contracts, tokenId, askPrice ?? 0n)}
      />
    </div>
  );
}

type ListingReadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; listing: LiveMarketplaceListing }
  | { status: "missing" }
  | { status: "error" };

export function MarketplaceTradePanel() {
  const registry = useClientRegistry();
  const client = useMemo(() => createConfiguredPublicClient(registry.chainContext), [registry.chainContext]);
  const [listingIdInput, setListingIdInput] = useState("");
  const [listingState, setListingState] = useState<ListingReadState>({ status: "idle" });
  const [refresh, setRefresh] = useState(0);
  const listingId = parsePositiveActionId(listingIdInput);

  useEffect(() => {
    let cancelled = false;
    if (listingId === null || registry.contracts === null) {
      setListingState({ status: "idle" });
      return () => {
        cancelled = true;
      };
    }

    setListingState({ status: "loading" });
    void readMarketplaceListing(client, registry.contracts.Marketplace, listingId).then(
      (listing) => {
        if (!cancelled) setListingState(listing ? { status: "ready", listing } : { status: "missing" });
      },
      () => {
        if (!cancelled) setListingState({ status: "error" });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [client, listingId, refresh, registry.contracts]);

  const listing = listingState.status === "ready" ? listingState.listing : null;
  const activeListing = listing?.active ? listing : null;
  const disabledReason = getListingDisabledReason(listingId, listingState);
  const handleConfirmed = () => setRefresh((revision) => revision + 1);

  return (
    <div className="transaction-panel-stack market-trade-stack">
      <label className="transaction-input-row" htmlFor="market-listing-id">
        <span>On-chain listing ID</span>
        <input
          id="market-listing-id"
          inputMode="numeric"
          onChange={(event) => setListingIdInput(event.target.value)}
          placeholder="Enter listing ID"
          type="text"
          value={listingIdInput}
        />
      </label>
      <p className="market-listing-read-state" role="status">
        {formatListingReadState(listingState)}
      </p>
      <TransactionActionPanel
        actionDisabledReason={disabledReason}
        chainContext={registry.chainContext}
        contracts={registry.contracts}
        ctaLabel="Buy listing"
        description="Reads the escrowed listing first, then submits Marketplace.buy with its exact on-chain price."
        onConfirmed={handleConfirmed}
        registryMessage={registry.message}
        summary={[
          { label: "Function", value: "Marketplace.buy" },
          { label: "Listing ID", value: listingId?.toString() ?? "required" },
          { label: "Token ID", value: activeListing?.tokenId.toString() ?? "pending" },
          { label: "Exact value", value: activeListing ? `${formatEther(activeListing.price)} ETH` : "pending" }
        ]}
        title="Buy escrowed listing"
        writeRequest={(contracts) => activeListing === null ? null : ({
          kind: "marketBuy",
          contracts,
          listingId: activeListing.id,
          value: activeListing.price
        })}
      />
      <TransactionActionPanel
        actionDisabledReason={disabledReason}
        chainContext={registry.chainContext}
        contracts={registry.contracts}
        ctaLabel="Cancel listing"
        description="Returns escrowed inventory to the connected seller. The contract rejects non-sellers."
        onConfirmed={handleConfirmed}
        registryMessage={registry.message}
        summary={[
          { label: "Function", value: "Marketplace.cancel" },
          { label: "Listing ID", value: listingId?.toString() ?? "required" },
          { label: "Seller", value: activeListing?.seller ?? "pending" }
        ]}
        title="Cancel seller listing"
        writeRequest={(contracts) => activeListing === null ? null : ({
          kind: "marketCancel",
          contracts,
          listingId: activeListing.id
        })}
      />
      <TransactionActionPanel
        chainContext={registry.chainContext}
        contracts={registry.contracts}
        ctaLabel="Withdraw proceeds"
        description="Withdraws the connected wallet's credited marketplace proceeds."
        onConfirmed={handleConfirmed}
        registryMessage={registry.message}
        summary={[{ label: "Function", value: "Marketplace.withdrawProceeds" }]}
        title="Withdraw market proceeds"
        writeRequest={(contracts) => ({ kind: "marketWithdraw", contracts })}
      />
    </div>
  );
}

function getListingDisabledReason(listingId: bigint | null, state: ListingReadState): string | null {
  if (listingId === null) return "Enter a listing ID first.";
  if (state.status === "loading" || state.status === "idle") return "Checking the on-chain listing.";
  if (state.status === "error") return "Listing data is temporarily unavailable. Check the network connection and retry.";
  if (state.status === "missing") return "This listing ID does not exist.";
  if (!state.listing.active) return state.listing.sold ? "This listing is already sold." : "This listing is not active.";
  return null;
}

function formatListingReadState(state: ListingReadState): string {
  if (state.status === "loading") return "Loading escrow state";
  if (state.status === "error") return "Could not read escrow state";
  if (state.status === "missing") return "Listing not found";
  if (state.status === "ready") {
    const stateLabel = state.listing.active ? "Active" : state.listing.sold ? "Sold" : "Cancelled";
    return `${stateLabel} / ${formatEther(state.listing.price)} ETH / token ${state.listing.tokenId}`;
  }
  return "Enter a listing ID to load its exact price and escrow state";
}

type BuybackReadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; quote: LiveBuybackQuote }
  | { status: "error" };

export function BuybackPanel() {
  const registry = useClientRegistry();
  const client = useMemo(() => createConfiguredPublicClient(registry.chainContext), [registry.chainContext]);
  const [tokenIdInput, setTokenIdInput] = useState("");
  const [quoteState, setQuoteState] = useState<BuybackReadState>({ status: "idle" });
  const [refresh, setRefresh] = useState(0);
  const tokenId = parsePositiveTokenId(tokenIdInput);

  useEffect(() => {
    let cancelled = false;
    if (tokenId === null || registry.contracts === null) {
      setQuoteState({ status: "idle" });
      return () => {
        cancelled = true;
      };
    }

    setQuoteState({ status: "loading" });
    void readBuybackQuote(client, registry.contracts.BuybackVault, tokenId).then(
      (quote) => {
        if (!cancelled) setQuoteState({ status: "ready", quote });
      },
      () => {
        if (!cancelled) setQuoteState({ status: "error" });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [client, refresh, registry.contracts, tokenId]);

  const quote = quoteState.status === "ready" && quoteState.quote.active ? quoteState.quote : null;
  const disabledReason = getBuybackDisabledReason(tokenId, quoteState);
  const handleConfirmed = () => setRefresh((revision) => revision + 1);

  return (
    <div className="transaction-panel-stack buyback-stack">
      {registry.chainContext.isMainnet ? <MainnetTokenEntryNotice purpose="Buyback" /> : (
        <KnownInventoryTokenPicker
          contracts={registry.contracts}
          onSelectTokenId={(selectedTokenId) => setTokenIdInput(selectedTokenId.toString())}
          registryMessage={registry.message}
        />
      )}
      <label className="transaction-input-row" htmlFor="buyback-token-id">
        <span>Quoted inventory token ID</span>
        <input
          id="buyback-token-id"
          inputMode="numeric"
          onChange={(event) => setTokenIdInput(event.target.value)}
          placeholder="Select or enter token ID"
          type="text"
          value={tokenIdInput}
        />
      </label>
      <p className="market-listing-read-state" role="status">
        {formatBuybackReadState(quoteState)}
      </p>
      <TransactionActionPanel
        actionDisabledReason={disabledReason}
        approval={{
          ctaLabel: "Approve BuybackVault",
          description: "Approves BuybackVault to transfer the quoted ERC-1155 item.",
          writeRequest: (contracts) => ({
            kind: "approval",
            contracts,
            operator: "BuybackVault",
            approved: true
          })
        }}
        chainContext={registry.chainContext}
        contracts={registry.contracts}
        ctaLabel="Accept buyback"
        description="Transfers one quoted item into BuybackVault and credits the exact published payout."
        onConfirmed={handleConfirmed}
        registryMessage={registry.message}
        summary={[
          { label: "Function", value: "BuybackVault.acceptQuote" },
          { label: "Token ID", value: tokenId?.toString() ?? "required" },
          { label: "Payout", value: quote ? `${formatEther(quote.price)} ETH` : "no active quote" }
        ]}
        title="Accept protocol buyback"
        writeRequest={(contracts) => quote === null ? null : ({
          kind: "buybackAccept",
          contracts,
          tokenId: quote.tokenId,
          amount: 1n
        })}
      />
      <TransactionActionPanel
        chainContext={registry.chainContext}
        contracts={registry.contracts}
        ctaLabel="Withdraw payout"
        description="Withdraws the connected wallet's credited BuybackVault payout."
        onConfirmed={handleConfirmed}
        registryMessage={registry.message}
        summary={[{ label: "Function", value: "BuybackVault.withdrawPayout" }]}
        title="Withdraw buyback payout"
        writeRequest={(contracts) => ({ kind: "buybackWithdraw", contracts })}
      />
    </div>
  );
}

function getBuybackDisabledReason(tokenId: bigint | null, state: BuybackReadState): string | null {
  if (tokenId === null) return "Select an owned inventory token first.";
  if (state.status === "loading" || state.status === "idle") return "Checking the on-chain quote.";
  if (state.status === "error") return "Quote data is temporarily unavailable. Check the network connection and retry.";
  if (!state.quote.active || state.quote.price === 0n) return "No active buyback quote exists for this token.";
  return null;
}

function formatBuybackReadState(state: BuybackReadState): string {
  if (state.status === "loading") return "Loading buyback quote";
  if (state.status === "error") return "Could not read buyback quote";
  if (state.status === "ready" && state.quote.active) return `Active quote / ${formatEther(state.quote.price)} ETH`;
  if (state.status === "ready") return "No active quote for this token";
  return "Select a token to load its exact protocol quote";
}

type ForgeCraftPanelProps = {
  actionDisabledReason: string | null;
  displayValue: string;
  imprintHash: Hex;
  recipeId: bigint;
  value: bigint;
  onAccountChange?: (account: Address) => void;
  onConfirmed?: (receipt: TransactionReceipt) => void;
};

export function ForgeCraftPanel({
  actionDisabledReason,
  displayValue,
  imprintHash,
  onAccountChange,
  onConfirmed,
  recipeId,
  value
}: ForgeCraftPanelProps) {
  const registry = useClientRegistry();
  const safetyBlock = getPaidActionSafetyBlockReason(registry.chainContext);

  return (
    <TransactionActionPanel
      approval={{
        ctaLabel: "Approve Forge",
        description: "Approves Forge as an ERC-1155 operator so recipe inputs can be burned.",
        writeRequest: (contracts) => ({
          kind: "approval",
          contracts,
          operator: "Forge",
          approved: true
        })
      }}
      actionDisabledReason={safetyBlock ?? actionDisabledReason}
      chainContext={registry.chainContext}
      contracts={registry.contracts}
      ctaLabel="Craft recipe"
      description="Submits the matched blueprint and its provenance imprint with the exact recipe fee."
      registryMessage={registry.message}
      onAccountChange={onAccountChange}
      onConfirmed={onConfirmed}
      summary={[
        { label: "Function", value: "Forge.craftWithImprint" },
        { label: "Recipe ID", value: recipeId.toString() },
        { label: "Fee", value: displayValue },
        { label: "Imprint", value: imprintHash }
      ]}
      title="Craft recipe"
      writeRequest={(contracts) => ({
        kind: "forgeCraft",
        contracts,
        recipeId,
        imprintHash,
        value
      })}
    />
  );
}

export function RedemptionRequestPanel() {
  const registry = useClientRegistry();
  const [tokenIdInput, setTokenIdInput] = useState("");
  const tokenId = parsePositiveTokenId(tokenIdInput);

  return (
    <div className="transaction-panel-stack">
      {registry.chainContext.isMainnet ? <MainnetTokenEntryNotice purpose="Redemption" /> : (
        <KnownInventoryTokenPicker
          contracts={registry.contracts}
          onSelectTokenId={(selectedTokenId) => setTokenIdInput(selectedTokenId.toString())}
          registryMessage={registry.message}
          requireRedeemable
        />
      )}
      <label className="transaction-input-row" htmlFor="redemption-token-id">
        <span>Redeemable inventory token ID</span>
        <input
          id="redemption-token-id"
          inputMode="numeric"
          onChange={(event) => setTokenIdInput(event.target.value)}
          placeholder="Paste token ID"
          type="text"
          value={tokenIdInput}
        />
      </label>
      <TransactionActionPanel
        actionDisabledReason={tokenId === null ? "Enter a redeemable inventory token ID before requesting redemption." : null}
        approval={{
          ctaLabel: "Approve RedemptionRegistry",
          description: "Approves RedemptionRegistry as an ERC-1155 operator before escrow.",
          writeRequest: (contracts) => ({
            kind: "approval",
            contracts,
            operator: "RedemptionRegistry",
            approved: true
          })
        }}
        chainContext={registry.chainContext}
        contracts={registry.contracts}
        ctaLabel="Request redemption"
        description="Calls RedemptionRegistry.requestRedemption for an owned redeemable inventory token."
        registryMessage={registry.message}
        summary={[{ label: "Function", value: "RedemptionRegistry.requestRedemption" }]}
        title="Request physical redemption"
        writeRequest={(contracts) => createRedemptionRequestForToken(contracts, tokenId)}
      />
    </div>
  );
}

const redemptionAdminModeLabels: Record<RedemptionAdminMode, { ctaLabel: string; functionName: string }> = {
  approve: {
    ctaLabel: "Approve request",
    functionName: "RedemptionRegistry.approve"
  },
  markPacked: {
    ctaLabel: "Mark packed",
    functionName: "RedemptionRegistry.markPacked"
  },
  markShipped: {
    ctaLabel: "Mark shipped",
    functionName: "RedemptionRegistry.markShipped"
  },
  complete: {
    ctaLabel: "Complete redemption",
    functionName: "RedemptionRegistry.complete"
  },
  cancel: {
    ctaLabel: "Cancel redemption",
    functionName: "RedemptionRegistry.cancel"
  }
};

export function RedemptionOpsPanel() {
  const registry = useClientRegistry();
  const [mode, setMode] = useState<RedemptionAdminMode>("approve");
  const [requestIdInput, setRequestIdInput] = useState("");
  const [trackingRef, setTrackingRef] = useState("");
  const [reason, setReason] = useState("");
  const requestId = parsePositiveActionId(requestIdInput);
  const action = redemptionAdminModeLabels[mode];
  const actionDisabledReason = getRedemptionOpsDisabledReason(mode, requestId, trackingRef, reason);

  return (
    <div className="transaction-panel-stack admin-ops-stack">
      <div className="redemption-ops-controls">
        <label className="transaction-input-row" htmlFor="redemption-ops-mode">
          <span>Operation mode</span>
          <select
            id="redemption-ops-mode"
            onChange={(event) => setMode(event.target.value as RedemptionAdminMode)}
            value={mode}
          >
            <option value="approve">Approve request</option>
            <option value="markPacked">Mark packed</option>
            <option value="markShipped">Mark shipped</option>
            <option value="complete">Complete redemption</option>
            <option value="cancel">Cancel redemption</option>
          </select>
        </label>
        <label className="transaction-input-row" htmlFor="redemption-ops-request-id">
          <span>Request ID</span>
          <input
            id="redemption-ops-request-id"
            inputMode="numeric"
            onChange={(event) => setRequestIdInput(event.target.value)}
            placeholder="Paste request ID"
            type="text"
            value={requestIdInput}
          />
        </label>
        {mode === "markShipped" ? (
          <label className="transaction-input-row" htmlFor="redemption-ops-tracking">
            <span>Tracking reference</span>
            <input
              id="redemption-ops-tracking"
              onChange={(event) => setTrackingRef(event.target.value)}
              placeholder="Carrier or internal ref"
              type="text"
              value={trackingRef}
            />
          </label>
        ) : null}
        {mode === "cancel" ? (
          <label className="transaction-input-row" htmlFor="redemption-ops-reason">
            <span>Cancellation reason</span>
            <textarea
              id="redemption-ops-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason visible in ops history"
              value={reason}
            />
          </label>
        ) : null}
      </div>
      <TransactionActionPanel
        actionDisabledReason={actionDisabledReason}
        chainContext={registry.chainContext}
        contracts={registry.contracts}
        ctaLabel={action.ctaLabel}
        description={`Submits fulfillment status updates on ${registry.chainContext.chainName}. Wallet must hold REDEMPTION_ADMIN_ROLE.`}
        registryMessage={registry.message}
        summary={[
          { label: "Function", value: action.functionName },
          { label: "Request ID", value: requestId?.toString() ?? "required" }
        ]}
        title="Redemption operations"
        writeRequest={(contracts) =>
          createRedemptionAdminRequest(contracts, {
            mode,
            requestId,
            trackingRef,
            reason
          })
        }
      />
    </div>
  );
}

function getRedemptionOpsDisabledReason(
  mode: RedemptionAdminMode,
  requestId: bigint | null,
  trackingRef: string,
  reason: string
): string | null {
  if (requestId === null) {
    return "Enter a redemption request ID before submitting an operator update.";
  }

  if (mode === "markShipped" && trackingRef.trim().length === 0) {
    return "Enter a tracking reference before marking shipped.";
  }

  if (mode === "cancel" && reason.trim().length === 0) {
    return "Enter a cancellation reason before cancelling.";
  }

  return null;
}
