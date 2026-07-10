"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, type Address, type Hex, type TransactionReceipt } from "viem";
import { getDeploymentDiagnostics, loadDeploymentRegistrySnapshotFromEnv } from "../lib/deployments";
import { getReadyContractRegistry, type ProtocolContracts } from "../lib/contracts/registry";
import {
  createPackRevealRequestForPurchase,
  createMarketListRequestForToken,
  createRedemptionAdminRequest,
  createRedemptionRequestForToken,
  extractPackPurchaseId,
  parsePositiveActionId,
  parsePositiveTokenId,
  type RedemptionAdminMode,
  testnetWriteConfig
} from "../lib/contracts/transaction-config";
import { robinhoodTestnetChainId } from "../lib/contracts/wallet";
import { createRobinhoodPublicClient } from "../lib/contracts/public-client";
import { readMarketplaceListing, type LiveMarketplaceListing } from "../lib/contracts/marketplace-live";
import { readBuybackQuote, type LiveBuybackQuote } from "../lib/contracts/buyback-live";
import { KnownInventoryTokenPicker } from "./known-inventory-token-picker";
import { TransactionActionPanel } from "./transaction-action-panel";

type RegistryPanelState = {
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

    if (registry.contracts === null) {
      return { contracts: null, fullStackReady: false, message: registry.status.message };
    }

    if (registry.chainId !== robinhoodTestnetChainId) {
      return {
        contracts: null,
        fullStackReady: false,
        message: "This write flow is locked to Robinhood Chain Testnet."
      };
    }

    return {
      contracts: registry.contracts,
      fullStackReady: diagnostics.fullStackReady,
      message: registry.status.message
    };
  }, []);
}

export function PackPurchasePanel({ onPurchaseConfirmed }: { onPurchaseConfirmed?: (purchaseId: bigint) => void }) {
  const registry = useClientRegistry();
  const fullStackBlocked = registry.contracts !== null && !registry.fullStackReady;
  const blockedMessage =
    "New pulls are paused until PackSale and Vault Forge V4 are deployed together. Existing purchases can still be revealed.";

  return (
    <TransactionActionPanel
      contracts={fullStackBlocked ? null : registry.contracts}
      ctaLabel="Reserve pack"
      description="Calls PackSale.purchase with the exact seeded testnet ETH value."
      onConfirmed={(receipt) => {
        const purchaseId = extractPackPurchaseId(receipt);
        if (purchaseId !== null) onPurchaseConfirmed?.(purchaseId);
      }}
      registryMessage={fullStackBlocked ? blockedMessage : registry.message}
      summary={[
        { label: "Function", value: "PackSale.purchase" },
        { label: "Drop ID", value: testnetWriteConfig.pack.dropId.toString() },
        { label: "Value", value: testnetWriteConfig.pack.displayValue }
      ]}
      title="Reserve pack on testnet"
      writeRequest={(contracts) => ({
        kind: "packPurchase",
        contracts,
        dropId: testnetWriteConfig.pack.dropId,
        value: testnetWriteConfig.pack.value
      })}
    />
  );
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
        ctaLabel="Reveal purchase"
        description="Calls PackSale.reveal after testnet randomness is ready."
        registryMessage={registry.message}
        summary={[
          { label: "Function", value: "PackSale.reveal" },
          { label: "Purchase ID", value: purchaseId?.toString() ?? "required" }
        ]}
        title="Reveal purchase on testnet"
        writeRequest={(contracts) => createPackRevealRequestForPurchase(contracts, purchaseId)}
      />
    </div>
  );
}

type TokenInputPanelProps = {
  inputId: string;
};

export function MarketplaceListPanel({ inputId }: TokenInputPanelProps) {
  const registry = useClientRegistry();
  const [tokenIdInput, setTokenIdInput] = useState("");
  const tokenId = parsePositiveTokenId(tokenIdInput);

  return (
    <div className="transaction-panel-stack">
      <KnownInventoryTokenPicker
        contracts={registry.contracts}
        onSelectTokenId={(selectedTokenId) => setTokenIdInput(selectedTokenId.toString())}
        registryMessage={registry.message}
      />
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
      <TransactionActionPanel
        actionDisabledReason={tokenId === null ? "Enter an owned inventory token ID before listing." : null}
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
        contracts={registry.contracts}
        ctaLabel="List item"
        description="Calls Marketplace.list for one owned inventory-backed token."
        registryMessage={registry.message}
        summary={[
          { label: "Function", value: "Marketplace.list" },
          { label: "Amount", value: testnetWriteConfig.market.amount.toString() },
          { label: "Ask", value: testnetWriteConfig.market.displayPrice }
        ]}
        title="List item on testnet"
        writeRequest={(contracts) => createMarketListRequestForToken(contracts, tokenId)}
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
  const client = useMemo(() => createRobinhoodPublicClient(), []);
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
  if (state.status === "error") return "Listing read failed. Check the testnet RPC and retry.";
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
  const client = useMemo(() => createRobinhoodPublicClient(), []);
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
      <KnownInventoryTokenPicker
        contracts={registry.contracts}
        onSelectTokenId={(selectedTokenId) => setTokenIdInput(selectedTokenId.toString())}
        registryMessage={registry.message}
      />
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
  if (state.status === "error") return "Quote read failed. Check the testnet RPC and retry.";
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
      actionDisabledReason={actionDisabledReason}
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
      title="Craft recipe on testnet"
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
      <KnownInventoryTokenPicker
        contracts={registry.contracts}
        onSelectTokenId={(selectedTokenId) => setTokenIdInput(selectedTokenId.toString())}
        registryMessage={registry.message}
        requireRedeemable
      />
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
        contracts={registry.contracts}
        ctaLabel="Request redemption"
        description="Calls RedemptionRegistry.requestRedemption for an owned redeemable inventory token."
        registryMessage={registry.message}
        summary={[{ label: "Function", value: "RedemptionRegistry.requestRedemption" }]}
        title="Request redemption on testnet"
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
        contracts={registry.contracts}
        ctaLabel={action.ctaLabel}
        description="Submits testnet fulfillment status updates. Wallet must hold REDEMPTION_ADMIN_ROLE."
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
