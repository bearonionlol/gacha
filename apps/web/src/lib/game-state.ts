import { signalRun } from "./arcade";
import { buildActivityTimeline, type ProtocolActivityEvent } from "./activity-index";
import { collectibleCards, vaultStats } from "./inventory";
import { loadChainContextFromEnv } from "./deployments";
import { protocolWriteConfig } from "./contracts/transaction-config";

const chainContext = loadChainContextFromEnv();
const redemptionCard =
  collectibleCards.find((card) => card.id === "inv-sample-graded-001") ?? collectibleCards[0];

export const activeDrop = {
  id: "drop-rht-001",
  title: "Founder's Vault Capsule",
  chainMode: chainContext.chainName,
  environmentLabel: chainContext.environmentLabel,
  isIllustrative: chainContext.isDemo,
  packPriceCents: 900,
  priceLabel: protocolWriteConfig.pack.displayValue,
  testnetPriceLabel: protocolWriteConfig.pack.displayValue,
  totalSupply: 1,
  remainingSupply: 1,
  inventoryBackedCount: 1,
  randomnessDisclosure: chainContext.isDemo
    ? "Illustrative demo pull: one vault-backed card, the displayed starter materials, and 100 Magic Dust. Two independent specialty rolls each use the published distribution: 50% Echo, 35% Prism, and 15% Star. Demo interactions do not submit transactions."
    : chainContext.isMainnet
      ? "Each settled pull contains one vault-backed card, the displayed starter materials, and 100 Magic Dust. Two independent specialty rolls each use the published distribution: 50% Echo, 35% Prism, and 15% Star. Arcade and Forge activity never change these odds. Mainnet purchases remain locked unless the registry identifies a valid pinned randomness coordinator."
      : "Each testnet pull contains one vault-backed card, the displayed starter materials, and 100 Magic Dust. Two independent specialty rolls each use the published distribution: 50% Echo, 35% Prism, and 15% Star. Test assets have no monetary value, and arcade or Forge activity never changes these odds.",
  guarantees: [
    { label: "Vaulted physical card", amount: "1" },
    { label: "Fire shards", amount: "3" },
    { label: "Vault seal", amount: "1" },
    { label: "Magic Dust", amount: "100" },
    { label: "Specialty Dust rolls", amount: "2 x 10" }
  ]
};

export const revealPreview = {
  state: "ready",
  title: collectibleCards[0]?.title ?? "Vault-backed collectible",
  cardId: collectibleCards[0]?.id ?? "sample-card",
  nextActions: ["Keep in vault", "List on market", "Accept buyback", "Request redemption", "Use in Forge"],
  disclosure: activeDrop.randomnessDisclosure
};

export const marketListings = collectibleCards.map((card, index) => ({
  id: `listing-${card.id}`,
  cardId: card.id,
  title: card.title,
  seller: index === 0 ? "Vault Operator" : chainContext.isDemo ? "Demo Vault Seller" : "Vault Seller",
  askCents: Math.round(card.estimateCents * 1.12),
  buybackCents: card.buybackCents,
  forgeTier: card.forgeTier,
  tradeInEligible: card.tradeInEligible,
  forgeSetKey: card.forgeSetKey,
  grailTier: card.grailTier,
  feeBps: 250,
  escrowDisclosure: chainContext.isDemo
    ? "Illustrative escrow state only; no blockchain write is submitted in demo mode."
    : "The token remains in contract escrow until sale or cancellation."
}));

export const forgeRecipes = [
  {
    id: "recipe-fire-signal",
    title: "Fire Signal Upgrade",
    progressPercent: signalRun.recipeProgressPercent,
    ingredients: ["fire", "charizard", "pokemon_raw"],
    output: "Animated vault badge",
    cap: 25,
    feeCents: 150,
    warning: "Crafting preview does not burn items or guarantee secondary market value."
  },
  {
    id: "recipe-grail-path",
    title: "Grail Path",
    progressPercent: 38,
    ingredients: ["alternate_art", "pokemon_graded"],
    output: "Priority redemption review",
    cap: 10,
    feeCents: 250,
    warning: "Grail recipes require explicit confirmation in later protocol phases."
  }
];

export const redemptionRequests = [
  {
    id: "redeem-001",
    cardId: redemptionCard?.id ?? "sample-graded-card",
    title: redemptionCard?.title ?? "Pokemon TCG Lugia V Alternate Art",
    status: "approved",
    requestedAt: "2026-07-09T00:00:00.000Z",
    steps: ["Requested", "Approved", "Packed", "Shipped", "Completed"]
  }
];

const activityEvents: ProtocolActivityEvent[] = [
  {
    id: "activity-drop-ready",
    type: "INVENTORY_VERIFIED",
    detail: chainContext.isDemo
      ? `${vaultStats.totalItems} illustrative vault items loaded for the demo collection.`
      : `${vaultStats.totalItems} vault items available in the current collection view.`,
    createdAt: "2026-07-09T00:00:00.000Z"
  },
  {
    id: "activity-signal-run",
    type: "SIGNAL_RUN_UPDATED",
    detail: `${signalRun.streak} day streak, no odds boost applied.`,
    createdAt: "2026-07-09T00:01:00.000Z"
  },
  {
    id: "activity-forge-submit",
    type: "FORGE_CRAFTED",
    detail: "Recast Seal pattern verified with protected Anchor custody.",
    txHash: "0xfeed0001",
    createdAt: "2026-07-09T00:02:00.000Z"
  }
];

export const activityFeed = buildActivityTimeline(activityEvents);
