import { signalRun } from "./arcade";
import { buildActivityTimeline, type ProtocolActivityEvent } from "./activity-index";
import { collectibleCards, vaultStats } from "./inventory";

const redemptionCard =
  collectibleCards.find((card) => card.id === "inv-sample-graded-001") ?? collectibleCards[0];

export const activeDrop = {
  id: "drop-rht-001",
  title: "Vault Signal Drop",
  chainMode: "Robinhood Chain Testnet",
  packPriceCents: 900,
  totalSupply: 2500,
  remainingSupply: 1840,
  inventoryBackedCount: vaultStats.totalItems,
  randomnessDisclosure: "Operator-controlled testnet randomness preview; odds are fixed before purchase.",
  odds: [
    { label: "Physical grail", chancePercent: 1.2 },
    { label: "Major hit", chancePercent: 8.8 },
    { label: "Crafting material", chancePercent: 30 },
    { label: "Base collectible", chancePercent: 60 }
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
  seller: index === 0 ? "Vault Operator" : "Sample Vault Seller",
  askCents: Math.round(card.estimateCents * 1.12),
  buybackCents: card.buybackCents,
  feeBps: 250,
  escrowDisclosure: "Escrow is modeled in demo mode; no blockchain write is submitted."
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
    status: "reviewing",
    requestedAt: "2026-07-09T00:00:00.000Z",
    steps: ["Requested", "Vault review", "Shipping quote", "Completed"]
  }
];

const activityEvents: ProtocolActivityEvent[] = [
  {
    id: "activity-drop-ready",
    type: "INVENTORY_VERIFIED",
    detail: `${vaultStats.totalItems} vault items eligible for deterministic demo drops.`,
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
    detail: "Fire Signal Upgrade recipe #1 queued for wallet confirmation.",
    txHash: "0xfeed0001",
    createdAt: "2026-07-09T00:02:00.000Z"
  }
];

export const activityFeed = buildActivityTimeline(activityEvents);
