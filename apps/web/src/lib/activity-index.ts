import { ROBINHOOD_CHAIN_TESTNET_ID, robinhoodChainsById } from "@gacha/shared";

export type ProtocolActivityType =
  | "BUYBACK_ACCEPTED"
  | "FORGE_CRAFTED"
  | "INVENTORY_VERIFIED"
  | "MARKET_LISTED"
  | "PACK_OPENED"
  | "REDEMPTION_REQUESTED"
  | "SIGNAL_RUN_UPDATED";

export type ProtocolActivityEvent = {
  createdAt: string;
  detail: string;
  id?: string;
  txHash?: string;
  type: ProtocolActivityType;
};

export type IndexedActivity = {
  createdAt: string;
  detail: string;
  id: string;
  label: string;
  nextAction: string;
  source: "arcade" | "forge" | "market" | "protocol" | "redemption" | "vault";
  txHash: string | null;
  txUrl: string | null;
};

const activityMetadata: Record<
  ProtocolActivityType,
  Pick<IndexedActivity, "label" | "nextAction" | "source">
> = {
  BUYBACK_ACCEPTED: {
    label: "Buyback accepted",
    nextAction: "Withdraw proceeds",
    source: "market"
  },
  FORGE_CRAFTED: {
    label: "Forge craft submitted",
    nextAction: "Inspect crafted output",
    source: "forge"
  },
  INVENTORY_VERIFIED: {
    label: "Inventory verified",
    nextAction: "Ready for drop pool",
    source: "vault"
  },
  MARKET_LISTED: {
    label: "Market listing created",
    nextAction: "Watch floor and buyback spread",
    source: "market"
  },
  PACK_OPENED: {
    label: "Pack opened",
    nextAction: "Choose vault, market, buyback, redeem, or Forge",
    source: "protocol"
  },
  REDEMPTION_REQUESTED: {
    label: "Redemption requested",
    nextAction: "Track fulfillment",
    source: "redemption"
  },
  SIGNAL_RUN_UPDATED: {
    label: "Arcade streak updated",
    nextAction: "Keep streaking without odds boosts",
    source: "arcade"
  }
};

export function getExplorerTxUrl({ chainId, txHash }: { chainId: number; txHash: string }): string | null {
  const explorerUrl = robinhoodChainsById[chainId]?.blockExplorers?.default.url;

  return explorerUrl === undefined ? null : `${explorerUrl.replace(/\/$/, "")}/tx/${txHash}`;
}

export function buildActivityTimeline(
  events: ProtocolActivityEvent[],
  { chainId = ROBINHOOD_CHAIN_TESTNET_ID }: { chainId?: number } = {}
): IndexedActivity[] {
  return [...events]
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
    .map((event, index) => {
      const metadata = activityMetadata[event.type];
      const txHash = event.txHash ?? null;

      return {
        createdAt: event.createdAt,
        detail: event.detail,
        id: event.id ?? `${event.createdAt}-${event.type}-${index}`,
        label: metadata.label,
        nextAction: metadata.nextAction,
        source: metadata.source,
        txHash,
        txUrl: txHash === null ? null : getExplorerTxUrl({ chainId, txHash })
      };
    });
}
